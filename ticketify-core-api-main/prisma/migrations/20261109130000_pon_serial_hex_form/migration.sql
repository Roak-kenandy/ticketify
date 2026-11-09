-- GPON serials are stored as printed after "SN:" on the label and as INCA uses them:
-- 16 hex (48575443686AEC86). Values stored in the short vendor form (HWTC686AEC86)
-- are converted, matching normalizeSerial() in src/inventory/serial.ts.

UPDATE "serial_units" AS unit
SET "serial_number" = upper(encode(convert_to(substr(unit."serial_number", 1, 4), 'UTF8'), 'hex')) || substr(unit."serial_number", 5)
WHERE unit."serial_number" ~ '^[A-Z]{4}[0-9A-F]{8}$'
  AND NOT EXISTS (
    SELECT 1 FROM "serial_units" AS other
    WHERE other."serial_number" =
      upper(encode(convert_to(substr(unit."serial_number", 1, 4), 'UTF8'), 'hex')) || substr(unit."serial_number", 5)
  );

UPDATE "technician_stock_movements"
SET "serial_number" = upper(encode(convert_to(substr("serial_number", 1, 4), 'UTF8'), 'hex')) || substr("serial_number", 5)
WHERE "serial_number" ~ '^[A-Z]{4}[0-9A-F]{8}$';

UPDATE "ticket_inventory_consumptions"
SET "serial_number" = upper(encode(convert_to(substr("serial_number", 1, 4), 'UTF8'), 'hex')) || substr("serial_number", 5)
WHERE "serial_number" ~ '^[A-Z]{4}[0-9A-F]{8}$';
