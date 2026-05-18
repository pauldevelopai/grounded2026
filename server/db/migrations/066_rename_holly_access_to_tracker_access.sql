DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_members' AND column_name = 'holly_access'
  ) THEN
    ALTER TABLE team_members RENAME COLUMN holly_access TO tracker_access;
  END IF;
END $$;
