import pool from '../db/pool.js';
import xlsx from 'xlsx';

const XLSX_PATH = '/tmp/tracker_sheet.xlsx';

function parseEmailsFromString(str) {
  if (!str) return [];
  const matches = str.match(/[\w.+-]+@[\w.-]+\.\w+/g);
  return matches || [];
}

function parseNamesFromEmailField(str) {
  if (!str) return [];
  // Match "Name <email>" or "Name: Title <email>" patterns
  const results = [];
  const parts = str.split(',').map(s => s.trim());
  for (const part of parts) {
    const nameMatch = part.match(/^([^<]+)</);
    if (nameMatch) {
      let name = nameMatch[1].replace(/[:"]/g, '').trim();
      // Remove publication names in quotes
      name = name.replace(/"[^"]*"/g, '').trim();
      if (name && !name.includes('@')) results.push(name);
    }
  }
  return results;
}

async function importData() {
  const wb = xlsx.readFile(XLSX_PATH);
  console.log('Sheets found:', wb.SheetNames.join(', '));

  const client = await pool.connect();
  try {
    // Get Media sector ID
    const { rows: sectors } = await client.query('SELECT id, slug FROM sectors');
    const mediaSectorId = sectors.find(s => s.slug === 'media')?.id;
    if (!mediaSectorId) {
      console.error('Media sector not found. Run seed first.');
      return;
    }

    let orgsCreated = 0;
    let contactsCreated = 0;
    let orgsSkipped = 0;

    // ============= SHEET 1: EXILED (TRF Russian newsrooms) =============
    console.log('\n--- EXILED (TRF Programme) ---');
    const exiledWs = wb.Sheets['EXILED'];
    const exiledData = xlsx.utils.sheet_to_json(exiledWs, { header: 1 });

    // Find header row (has 'ORGANISATION' in it)
    let exiledHeaderIdx = exiledData.findIndex(row => row && row.includes('ORGANISATION'));
    if (exiledHeaderIdx === -1) exiledHeaderIdx = 1; // fallback
    const exiledHeaders = exiledData[exiledHeaderIdx];

    for (let i = exiledHeaderIdx + 1; i < exiledData.length; i++) {
      const row = exiledData[i];
      if (!row || !row[0] || !row[0].trim()) continue;

      const s = idx => (row[idx] != null ? String(row[idx]).trim() : '');
      const orgName = s(0);
      const clientName = s(1);
      const primaryPeople = s(2);
      const tasks = s(3);
      const statusMarch = s(4);
      const statusFeb = s(5);
      const statusJan = s(6);
      const statusDec = s(7);
      const janMeetingDate = s(8);
      const website = s(9);
      const meetingDates = s(10);
      const newsroomDoc = s(11);
      const prototypeDoc = s(12);
      const policyDoc = s(13);
      const checklistDoc = s(14);
      const figmaBoard = s(15);
      const emails = s(16);

      // Check if org exists
      const { rows: existing } = await client.query('SELECT id FROM organisations WHERE name = $1', [orgName]);
      let orgId;

      if (existing.length > 0) {
        orgId = existing[0].id;
        orgsSkipped++;
        console.log(`  skip: ${orgName} (exists)`);
      } else {
        const notes = [
          `Programme: ${clientName}`,
          tasks ? `Current tasks: ${tasks}` : '',
          statusMarch ? `Status (March): ${statusMarch}` : '',
          statusFeb ? `Status (Feb): ${statusFeb}` : '',
          meetingDates ? `Meeting dates: ${meetingDates}` : '',
          policyDoc ? `Ethical policy: ${policyDoc}` : '',
          checklistDoc ? `Policy checklist: ${checklistDoc}` : '',
          prototypeDoc ? `Prototype: ${prototypeDoc}` : '',
          newsroomDoc ? `Newsroom summary: ${newsroomDoc}` : '',
          figmaBoard ? `Figma: ${figmaBoard}` : '',
        ].filter(Boolean).join('\n');

        const { rows: [newOrg] } = await client.query(
          `INSERT INTO organisations (sector_id, name, type, website, notes, relationship_stage)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [mediaSectorId, orgName, 'media NGO', website || null, notes, 'active']
        );
        orgId = newOrg.id;
        orgsCreated++;
        console.log(`  added: ${orgName}`);
      }

      // Parse people names from the "Primary people" field
      if (primaryPeople) {
        const names = primaryPeople
          .replace(/\(.*?\)/g, '') // remove parenthetical notes
          .replace(/ IS NEW/gi, '')
          .replace(/ and /gi, ',')
          .replace(/\bwith\b/gi, ',')
          .replace(/\+/g, ',')
          .split(',')
          .map(n => n.trim().toUpperCase().charAt(0) + n.trim().slice(1).toLowerCase())
          .filter(n => n.length > 1 && !n.includes('very') && !n.includes('dedicated'));

        for (const name of names) {
          const { rows: existingContact } = await client.query(
            'SELECT id FROM contacts WHERE first_name = $1 AND organisation_id = $2',
            [name, orgId]
          );
          if (existingContact.length === 0) {
            await client.query(
              `INSERT INTO contacts (sector_id, first_name, last_name, organisation_id, pipeline_stage, source, notes)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [mediaSectorId, name, '', orgId, 'client', 'TRF programme', `Primary contact at ${orgName}`]
            );
            contactsCreated++;
            console.log(`    contact: ${name}`);
          }
        }
      }
    }

    // ============= SHEET 2: ZIMZAM (Zimbabwean media) =============
    console.log('\n--- ZIMZAM ---');
    const zimWs = wb.Sheets['ZIMZAM'];
    const zimData = xlsx.utils.sheet_to_json(zimWs, { header: 1 });

    for (let i = 0; i < zimData.length; i++) {
      const row = zimData[i];
      if (!row || !row[0] || row[0] === 'ORGANISATION') continue;

      const orgName = row[0].trim();
      if (!orgName) continue;

      const sz = idx => (row[idx] != null ? String(row[idx]).trim() : '');
      const website = sz(2);
      const teamSize = sz(3);
      const location = sz(4);
      const age = sz(5);

      const { rows: existing } = await client.query('SELECT id FROM organisations WHERE name = $1', [orgName]);
      if (existing.length > 0) {
        orgsSkipped++;
        console.log(`  skip: ${orgName} (exists)`);
        continue;
      }

      const notes = [
        location ? `Location: ${location}` : '',
        teamSize ? `Team size: ${teamSize}` : '',
        age ? `Newsroom age: ${age}` : '',
        'Programme: ZIMZAM',
      ].filter(Boolean).join('\n');

      // Try to extract country from location
      const country = location?.includes('Zimbabwe') ? 'Zimbabwe' : (location ? location.split(',').pop()?.trim() : 'Zimbabwe');

      await client.query(
        `INSERT INTO organisations (sector_id, name, type, website, country, notes, relationship_stage)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [mediaSectorId, orgName, 'media NGO', website || null, country || 'Zimbabwe', notes, 'prospect']
      );
      orgsCreated++;
      console.log(`  added: ${orgName}`);
    }

    // ============= SHEET 3: DNTF (South African media) =============
    console.log('\n--- DNTF ---');
    const dntfWs = wb.Sheets['DNTF'];
    const dntfData = xlsx.utils.sheet_to_json(dntfWs, { header: 1 });

    // Find header row
    let dntfHeaderIdx = dntfData.findIndex(row => row && row.includes('ORGANISATION'));
    if (dntfHeaderIdx === -1) dntfHeaderIdx = 1;

    for (let i = dntfHeaderIdx + 1; i < dntfData.length; i++) {
      const row = dntfData[i];
      if (!row || !row[0] || !row[0].trim()) continue;

      const sd = idx => (row[idx] != null ? String(row[idx]).trim() : '');
      const orgName = sd(0);
      const province = sd(1);
      const language = sd(2);
      const febMeetings = sd(3); // Contains "Name <email>" entries
      const febStatus = sd(4);
      const primaryPeople = sd(5);
      const projectDetails = sd(6);
      const website = sd(7);

      const { rows: existing } = await client.query('SELECT id FROM organisations WHERE name = $1', [orgName]);
      let orgId;

      if (existing.length > 0) {
        orgId = existing[0].id;
        orgsSkipped++;
        console.log(`  skip: ${orgName} (exists)`);
      } else {
        const notes = [
          province ? `Province: ${province}` : '',
          language ? `Language: ${language}` : '',
          projectDetails ? `Project: ${projectDetails.slice(0, 500)}${projectDetails.length > 500 ? '...' : ''}` : '',
          febStatus ? `Status (Feb): ${febStatus}` : '',
          'Programme: DNTF',
        ].filter(Boolean).join('\n');

        const city = province || '';

        const { rows: [newOrg] } = await client.query(
          `INSERT INTO organisations (sector_id, name, type, website, country, city, notes, relationship_stage)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [mediaSectorId, orgName, 'media NGO', website || null, 'South Africa', city, notes, 'active']
        );
        orgId = newOrg.id;
        orgsCreated++;
        console.log(`  added: ${orgName}`);
      }

      // Extract contacts from "Feb meetings" field (contains "Name <email>" format)
      const emailsFromMeetings = parseEmailsFromString(febMeetings);
      const namesFromMeetings = parseNamesFromEmailField(febMeetings);

      for (let j = 0; j < namesFromMeetings.length; j++) {
        const name = namesFromMeetings[j];
        const email = emailsFromMeetings[j] || '';
        const nameParts = name.split(' ');
        const firstName = nameParts[0] || name;
        const lastName = nameParts.slice(1).join(' ') || '';

        const { rows: existingContact } = await client.query(
          'SELECT id FROM contacts WHERE first_name = $1 AND last_name = $2 AND organisation_id = $3',
          [firstName, lastName, orgId]
        );
        if (existingContact.length === 0) {
          await client.query(
            `INSERT INTO contacts (sector_id, first_name, last_name, email, organisation_id, pipeline_stage, source, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [mediaSectorId, firstName, lastName, email || null, orgId, 'client', 'DNTF programme', `Contact at ${orgName}`]
          );
          contactsCreated++;
          console.log(`    contact: ${firstName} ${lastName}${email ? ' <' + email + '>' : ''}`);
        }
      }
    }

    console.log(`\n=== IMPORT COMPLETE ===`);
    console.log(`Organisations created: ${orgsCreated}`);
    console.log(`Organisations skipped: ${orgsSkipped}`);
    console.log(`Contacts created: ${contactsCreated}`);

  } finally {
    client.release();
    await pool.end();
  }
}

importData().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
