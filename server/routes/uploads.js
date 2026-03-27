import { Router } from 'express';
import pool from '../db/pool.js';
import { upload } from '../middleware/upload.js';
import { processUpload } from '../services/document-processor.js';
import { extractDocumentData } from '../services/claude.js';
import fs from 'fs';

const router = Router();

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { entity_type, entity_id, sector_id } = req.body;

    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, sector_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path,
       entity_type || null, entity_id || null, sector_id || null, req.user.id]
    );

    // Process asynchronously
    processUpload(doc.id).catch(err => console.error('Background processing failed:', err.message));

    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Upload failed' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    let query = 'SELECT * FROM uploaded_documents WHERE 1=1';
    const params = [];
    if (entity_type) { params.push(entity_type); query += ` AND entity_type = $${params.length}`; }
    if (entity_id) { params.push(entity_id); query += ` AND entity_id = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/apply', async (req, res) => {
  try {
    const { rows: [doc] } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [req.params.id]);
    if (!doc) return res.status(404).json({ message: 'Not found' });
    if (!doc.ai_extracted_data) return res.status(400).json({ message: 'No extracted data to apply' });
    if (!doc.entity_type || !doc.entity_id) return res.status(400).json({ message: 'Document not linked to an entity' });

    const data = doc.ai_extracted_data;

    // Apply to organisation
    if (doc.entity_type === 'organisation') {
      const updates = {};
      if (data.name) updates.name = data.name;
      if (data.website) updates.website = data.website;
      if (data.country) updates.country = data.country;
      if (data.city) updates.city = data.city;
      if (data.type) updates.type = data.type;
      const notes = data.notes || data.summary || data.description || '';
      if (notes) updates.notes = notes;

      if (Object.keys(updates).length > 0) {
        const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ');
        const values = Object.values(updates);
        values.push(doc.entity_id);
        await pool.query(`UPDATE organisations SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`, values);
      }

      // Create contacts if extracted
      if (data.contacts && Array.isArray(data.contacts)) {
        for (const c of data.contacts) {
          if (c.name || c.first_name) {
            const firstName = c.first_name || c.name?.split(' ')[0] || '';
            const lastName = c.last_name || c.name?.split(' ').slice(1).join(' ') || '';
            await pool.query(
              `INSERT INTO contacts (sector_id, first_name, last_name, email, job_title, organisation_id, pipeline_stage, source)
               VALUES ($1, $2, $3, $4, $5, $6, 'prospect', 'document_upload')
               ON CONFLICT DO NOTHING`,
              [doc.sector_id, firstName, lastName, c.email || null, c.role || c.job_title || null, doc.entity_id]
            );
          }
        }
      }
    }

    res.json({ ok: true, message: 'Extracted data applied to entity' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Extract data from file or text and return preview (does NOT save to DB yet)
router.post('/extract-and-preview', upload.single('file'), async (req, res) => {
  try {
    let text = req.body?.text || '';
    const entityType = req.body?.entityType || 'general';

    if (req.file) {
      // Read uploaded file as text
      try {
        text = fs.readFileSync(req.file.path, 'utf-8');
      } catch {
        text = `[File: ${req.file.originalname}, type: ${req.file.mimetype}, size: ${req.file.size} bytes]`;
      }
    }

    if (!text.trim()) return res.status(400).json({ message: 'No content to extract from' });

    const rawResult = await extractDocumentData(text, entityType);
    let extracted;
    try {
      extracted = JSON.parse(rawResult);
    } catch {
      const match = rawResult.match(/\{[\s\S]*\}/);
      extracted = match ? JSON.parse(match[0]) : { raw: rawResult };
    }

    res.json({ extracted, entityType, sourceLength: text.length });
  } catch (err) {
    console.error('Extract preview error:', err);
    res.status(500).json({ message: err.message || 'Extraction failed' });
  }
});

// Save approved/edited data to the database
router.post('/approve', async (req, res) => {
  try {
    const { entityType, data } = req.body;
    if (!entityType || !data) return res.status(400).json({ message: 'entityType and data required' });

    let result = { ok: true, created: null };

    if (entityType === 'organisation') {
      const { rows: [org] } = await pool.query(
        `INSERT INTO organisations (sector_id, name, type, website, country, city, notes, relationship_stage)
         VALUES ((SELECT id FROM sectors WHERE is_active = true LIMIT 1), $1, $2, $3, $4, $5, $6, 'prospect') RETURNING id, name`,
        [data.name || 'Unknown', data.type || null, data.website || null, data.country || null, data.city || null, data.notes || data.summary || null]
      );
      result.created = { type: 'organisation', id: org.id, name: org.name };

      // Create contacts if present
      if (data.contacts && Array.isArray(data.contacts)) {
        for (const c of data.contacts) {
          const firstName = c.first_name || c.name?.split(' ')[0] || '';
          const lastName = c.last_name || c.name?.split(' ').slice(1).join(' ') || '';
          if (firstName) {
            await pool.query(
              `INSERT INTO contacts (sector_id, first_name, last_name, email, job_title, organisation_id, pipeline_stage, source)
               VALUES ((SELECT id FROM sectors WHERE is_active = true LIMIT 1), $1, $2, $3, $4, $5, 'prospect', 'document_upload')`,
              [firstName, lastName, c.email || null, c.role || c.job_title || null, org.id]
            );
          }
        }
      }
    } else if (entityType === 'contact') {
      const firstName = data.first_name || data.name?.split(' ')[0] || 'Unknown';
      const lastName = data.last_name || data.name?.split(' ').slice(1).join(' ') || '';
      const { rows: [contact] } = await pool.query(
        `INSERT INTO contacts (sector_id, first_name, last_name, email, phone, job_title, linkedin_url, notes, pipeline_stage, source)
         VALUES ((SELECT id FROM sectors WHERE is_active = true LIMIT 1), $1, $2, $3, $4, $5, $6, $7, 'prospect', 'document_upload') RETURNING id`,
        [firstName, lastName, data.email || null, data.phone || null, data.job_title || null, data.linkedin_url || null, data.notes || null]
      );
      result.created = { type: 'contact', id: contact.id, name: `${firstName} ${lastName}` };
    } else if (entityType === 'course') {
      const { rows: [course] } = await pool.query(
        `INSERT INTO courses (sector_id, title, description, delivery_type, status, last_updated_by)
         VALUES ((SELECT id FROM sectors WHERE is_active = true LIMIT 1), $1, $2, $3, 'draft', $4) RETURNING id, title`,
        [data.title || 'Untitled Course', data.description || null, data.delivery_type || 'both', req.user.id]
      );
      // Create modules if present
      if (data.modules && Array.isArray(data.modules)) {
        for (let i = 0; i < data.modules.length; i++) {
          const m = data.modules[i];
          await pool.query(
            `INSERT INTO course_modules (course_id, title, description, order_index, duration_minutes) VALUES ($1, $2, $3, $4, $5)`,
            [course.id, m.title || `Module ${i + 1}`, m.description || null, i, m.duration_minutes || null]
          );
        }
      }
      result.created = { type: 'course', id: course.id, name: course.title };
    } else if (entityType === 'funding_opportunity') {
      // Find or create funder
      let funderId = null;
      if (data.funder_name) {
        const { rows: existing } = await pool.query('SELECT id FROM funders WHERE name = $1', [data.funder_name]);
        if (existing.length > 0) { funderId = existing[0].id; }
        else {
          const { rows: [f] } = await pool.query('INSERT INTO funders (name) VALUES ($1) RETURNING id', [data.funder_name]);
          funderId = f.id;
        }
      }
      const { rows: [opp] } = await pool.query(
        `INSERT INTO funding_opportunities (sector_id, funder_id, title, description, amount_min, amount_max, deadline, pipeline_stage)
         VALUES ((SELECT id FROM sectors WHERE is_active = true LIMIT 1), $1, $2, $3, $4, $5, $6, 'researching') RETURNING id, title`,
        [funderId, data.title || 'Untitled', data.description || null, data.amount_min || null, data.amount_max || null, data.deadline || null]
      );
      result.created = { type: 'funding_opportunity', id: opp.id, name: opp.title };
    } else {
      // General knowledge — save to knowledge base
      await pool.query(
        `INSERT INTO knowledge_entries (source_type, source_id, category, content, confidence_score, is_verified)
         VALUES ('manual_upload', NULL, 'general', $1, 0.8, false)`,
        [typeof data === 'string' ? data : JSON.stringify(data)]
      );
      result.created = { type: 'knowledge', name: 'Knowledge entry added' };
    }

    res.json(result);
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ message: err.message || 'Save failed' });
  }
});

// Smart Input — absorb a text note into an entity
router.post('/smart-input', async (req, res) => {
  try {
    const { text, entityType, entityId, sectorId } = req.body;
    if (!text?.trim() || !entityType || !entityId) {
      return res.status(400).json({ message: 'text, entityType, and entityId required' });
    }

    // Get current entity data for context
    const tableMap = {
      organisation: 'organisations', contact: 'contacts', cohort: 'cohorts',
      course: 'courses', engagement: 'service_engagements', funder: 'funders',
      opportunity: 'funding_opportunities',
    };
    const table = tableMap[entityType];
    if (!table) return res.status(400).json({ message: 'Unknown entity type' });

    const { rows: [entity] } = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [entityId]);
    if (!entity) return res.status(404).json({ message: 'Entity not found' });

    // Use Claude to figure out what to update
    const { callClaude } = await import('../services/claude.js');
    const columns = Object.keys(entity).filter(k => !['id', 'created_at', 'updated_at', 'sector_id'].includes(k));

    const updateResult = await callClaude({
      system: `You are a data entry assistant. Given new information about a ${entityType}, determine what database fields to update.

Current ${entityType} fields and values:
${columns.map(k => `- ${k}: ${entity[k] !== null ? String(entity[k]).slice(0, 200) : 'null'}`).join('\n')}

The user has provided new information. Determine which fields to update. If the info is a general note, append it to the 'notes' field.

Return ONLY a JSON object with the fields to update. Example: {"notes": "existing notes\\n\\nNew: user said this", "website": "https://example.com"}
If the info should be appended to notes rather than replacing a field, concatenate it.
Return {} if nothing should be updated.`,
      userContent: text,
      maxTokens: 500,
      temperature: 0.1,
    });

    let updates;
    try {
      const match = updateResult.match(/\{[\s\S]*\}/);
      updates = match ? JSON.parse(match[0]) : {};
    } catch {
      updates = { notes: (entity.notes ? entity.notes + '\n\n' : '') + text };
    }

    // Apply updates
    const validKeys = Object.keys(updates).filter(k => columns.includes(k) && updates[k] !== undefined);
    if (validKeys.length > 0) {
      const setClauses = validKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      const values = validKeys.map(k => updates[k]);
      values.push(entityId);
      await pool.query(`UPDATE ${table} SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`, values);
    }

    // Also add to knowledge base
    await pool.query(
      `INSERT INTO knowledge_entries (source_type, source_id, category, content, confidence_score, is_verified)
       VALUES ($1, $2, $3, $4, 0.9, true)`,
      ['user_input', entityId, entityType, `[${entityType}: ${entity.name || entity.title || entity.first_name || entityId}] ${text}`]
    ).catch(() => {});

    res.json({ ok: true, message: `Updated ${validKeys.length} field${validKeys.length !== 1 ? 's' : ''}. Info absorbed.`, fieldsUpdated: validKeys });
  } catch (err) {
    console.error('Smart input error:', err);
    res.status(500).json({ message: err.message || 'Failed to process input' });
  }
});

// Smart Input File — absorb a document into an entity
router.post('/smart-input-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { entity_type, entity_id, sector_id } = req.body;
    if (!entity_type || !entity_id) return res.status(400).json({ message: 'entity_type and entity_id required' });

    // Save the upload record
    const { rows: [doc] } = await pool.query(
      `INSERT INTO uploaded_documents (filename, original_name, mime_type, file_size, file_path, entity_type, entity_id, sector_id, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.file.path,
       entity_type, entity_id, sector_id || null, req.user.id]
    );

    // Extract text from file
    let fileText = '';
    try {
      if (req.file.mimetype === 'application/pdf') {
        const pdf = await import('pdf-parse');
        const buffer = fs.readFileSync(req.file.path);
        const data = await pdf.default(buffer);
        fileText = data.text;
      } else if (req.file.mimetype.includes('word') || req.file.originalname.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ path: req.file.path });
        fileText = result.value;
      } else {
        fileText = fs.readFileSync(req.file.path, 'utf-8');
      }
    } catch {
      fileText = `[File: ${req.file.originalname}, unable to extract text]`;
    }

    if (!fileText.trim()) {
      return res.json({ ok: true, message: 'File uploaded but no text could be extracted.' });
    }

    // Get entity for context
    const tableMap = {
      organisation: 'organisations', contact: 'contacts', cohort: 'cohorts',
      course: 'courses', engagement: 'service_engagements', funder: 'funders',
    };
    const table = tableMap[entity_type];
    const { rows: [entity] } = table
      ? await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [entity_id])
      : { rows: [null] };

    // Claude extracts relevant info
    const { extractDocumentData } = await import('../services/claude.js');
    const extraction = await extractDocumentData(fileText.slice(0, 8000), entity_type);

    let extracted;
    try {
      const match = extraction.match(/\{[\s\S]*\}/);
      extracted = match ? JSON.parse(match[0]) : {};
    } catch {
      extracted = {};
    }

    // Apply to entity
    if (entity && table) {
      const columns = Object.keys(entity).filter(k => !['id', 'created_at', 'updated_at', 'sector_id'].includes(k));
      const validKeys = Object.keys(extracted).filter(k => columns.includes(k) && extracted[k]);

      // Always append a note about the upload
      const noteAddition = `\n\n[Document uploaded: ${req.file.originalname} on ${new Date().toLocaleDateString()}]`;
      if (columns.includes('notes')) {
        if (!validKeys.includes('notes')) {
          extracted.notes = (entity.notes || '') + noteAddition;
          validKeys.push('notes');
        } else {
          extracted.notes = (entity.notes || '') + '\n\n' + extracted.notes + noteAddition;
        }
      }

      if (validKeys.length > 0) {
        const setClauses = validKeys.map((k, i) => `${k} = $${i + 1}`).join(', ');
        const values = validKeys.map(k => extracted[k]);
        values.push(entity_id);
        await pool.query(`UPDATE ${table} SET ${setClauses}, updated_at = NOW() WHERE id = $${values.length}`, values);
      }
    }

    // Save extraction to document record
    await pool.query(
      'UPDATE uploaded_documents SET ai_extracted_data = $1, text_content = $2 WHERE id = $3',
      [JSON.stringify(extracted), fileText.slice(0, 10000), doc.id]
    );

    // Add to knowledge base
    await pool.query(
      `INSERT INTO knowledge_entries (source_type, source_id, category, content, confidence_score, is_verified)
       VALUES ('document_upload', $1, $2, $3, 0.85, false)`,
      [doc.id, entity_type, `[Document: ${req.file.originalname} for ${entity_type} ${entity?.name || entity?.title || entity_id}]\n${fileText.slice(0, 2000)}`]
    ).catch(() => {});

    res.json({ ok: true, message: `Document absorbed. ${Object.keys(extracted).length} fields extracted.`, extracted });
  } catch (err) {
    console.error('Smart input file error:', err);
    res.status(500).json({ message: err.message || 'Failed to process file' });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM uploaded_documents WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    const doc = rows[0];
    if (!doc.file_path || !fs.existsSync(doc.file_path)) {
      return res.status(404).json({ message: 'File not found on disk' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    fs.createReadStream(doc.file_path).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Download failed' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM uploaded_documents WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ message: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
