ALTER TABLE organisations ADD COLUMN IF NOT EXISTS latitude DECIMAL;
ALTER TABLE organisations ADD COLUMN IF NOT EXISTS longitude DECIMAL;

-- Set known coordinates for existing orgs
-- TRF Exiled Media (Russia-based, but exiled - use approximate locations)
UPDATE organisations SET latitude = 55.7558, longitude = 37.6173 WHERE name = 'Verstka'; -- Moscow origin
UPDATE organisations SET latitude = 59.9343, longitude = 30.3351 WHERE name LIKE 'Bumaga%'; -- St Petersburg
UPDATE organisations SET latitude = 57.0, longitude = 41.0 WHERE name = '7x7'; -- Regional Russia
UPDATE organisations SET latitude = 51.8, longitude = 107.6 WHERE name = 'People of Baikal'; -- Lake Baikal
UPDATE organisations SET latitude = 53.9045, longitude = 27.5615 WHERE name LIKE 'BIC%'; -- Minsk, Belarus

-- DNTF (South Africa)
UPDATE organisations SET latitude = -33.9249, longitude = 18.4241 WHERE name LIKE 'Currency%'; -- Cape Town
UPDATE organisations SET latitude = -29.8587, longitude = 31.0218 WHERE name LIKE 'Mpiyonke%'; -- KZN
UPDATE organisations SET latitude = -31.8971, longitude = 26.8753 WHERE name LIKE 'Queens Town%'; -- Queenstown
UPDATE organisations SET latitude = -33.3115, longitude = 26.5224 WHERE name LIKE 'Rhodes%'; -- Grahamstown
UPDATE organisations SET latitude = -33.9249, longitude = 18.4241 WHERE name LIKE 'WhatsNews%'; -- Cape Town

-- ZIMZAM (Zimbabwe)
UPDATE organisations SET latitude = -17.8252, longitude = 31.0335 WHERE name = 'Capital FM'; -- Harare
UPDATE organisations SET latitude = -17.8252, longitude = 31.0335 WHERE name = 'Enviropress'; -- Harare
UPDATE organisations SET latitude = -17.8252, longitude = 31.0335 WHERE name = 'Makanday'; -- Harare
UPDATE organisations SET latitude = -20.1475, longitude = 28.5922 WHERE name = 'Maricho Media'; -- Bulawayo
UPDATE organisations SET latitude = -17.8319, longitude = 25.8549 WHERE name = 'VicFallsLive'; -- Vic Falls

-- Funders
UPDATE organisations SET latitude = 51.5074, longitude = -0.1278 WHERE name = 'Thomson Reuters Foundation'; -- London
UPDATE organisations SET latitude = -29.8587, longitude = 31.0218 WHERE name = 'DNTF'; -- KZN, South Africa
