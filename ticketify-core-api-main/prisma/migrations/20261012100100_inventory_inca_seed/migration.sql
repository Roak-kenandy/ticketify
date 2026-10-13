-- A serial number can be consumed once; reversing the line releases it.
CREATE UNIQUE INDEX "ticket_inventory_consumptions_posted_serial_key"
  ON "ticket_inventory_consumptions" (UPPER("serial_number"))
  WHERE "status" = 'POSTED' AND "serial_number" IS NOT NULL;

-- Only one provisioning run may be in flight per Service Request.
CREATE UNIQUE INDEX "provisioning_transactions_active_per_ticket_key"
  ON "provisioning_transactions" ("crm_ticket_id")
  WHERE "status" NOT IN ('SUCCEEDED', 'FAILED');

-- Office Inventory Team role.
INSERT INTO "roles" ("id", "name", "created_at", "updated_at", "deleted_at")
VALUES ('6', 'Inventory', NOW(), NOW(), NULL)
ON CONFLICT ("id") DO NOTHING;

-- Seed the Phase 2 initial item master (spec §7); admins maintain it afterwards.
INSERT INTO "inventory_items" ("id", "code", "name", "category", "stock_uom", "consumption_uom", "conversion_factor", "serialized", "allow_decimal", "notes", "sort_order", "updated_at")
VALUES
  ('inv_box_12c', 'BOX_12C', '12C Box', 'Enclosure / box', 'Unit', 'Unit', 1, false, false, NULL, 10, NOW()),
  ('inv_patch_1m_apc', 'PATCH_1M_APC', '1M Patch Code APC', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 20, NOW()),
  ('inv_box_24c', 'BOX_24C', '24C Box', 'Enclosure / box', 'Unit', 'Unit', 1, false, false, NULL, 30, NOW()),
  ('inv_box_2c', 'BOX_2C', '2C Box', 'Enclosure / box', 'Unit', 'Unit', 1, false, false, NULL, 40, NOW()),
  ('inv_cable_2core', 'CABLE_2CORE', '2core Cable Roll 1 meter', 'Cable', 'Meter', 'Meter', 1, false, true, 'Decimal metres allowed', 50, NOW()),
  ('inv_patch_2m_lc', 'PATCH_2M_LC', '2M Patch Code (LC)', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 60, NOW()),
  ('inv_patch_2m_scapc_scupc', 'PATCH_2M_SCAPC_SCUPC', '2M patch code (SC APC - SC UPC)', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 70, NOW()),
  ('inv_splitter_2way', 'SPLITTER_2WAY', '2way Splitter', 'Splitter', 'Unit', 'Unit', 1, false, false, NULL, 80, NOW()),
  ('inv_box_4c', 'BOX_4C', '4C Box', 'Enclosure / box', 'Unit', 'Unit', 1, false, false, NULL, 90, NOW()),
  ('inv_box_4m', 'BOX_4M', '4M Box', 'Enclosure / box', 'Unit', 'Unit', 1, false, false, NULL, 100, NOW()),
  ('inv_splitter_4way_block_lc', 'SPLITTER_4WAY_BLOCK_LC', '4way Block LC Splitter', 'Splitter', 'Unit', 'Unit', 1, false, false, NULL, 110, NOW()),
  ('inv_splitter_4way_block_sc', 'SPLITTER_4WAY_BLOCK_SC', '4way Block SC splitter', 'Splitter', 'Unit', 'Unit', 1, false, false, NULL, 120, NOW()),
  ('inv_splitter_4way_blockless_sc', 'SPLITTER_4WAY_BLOCKLESS_SC', '4way Blockless SC Splitter', 'Splitter', 'Unit', 'Unit', 1, false, false, NULL, 130, NOW()),
  ('inv_clip_5mm', 'CLIP_5MM', '5mm Clip (Box)', 'Consumable', 'Box', 'Piece', 1, false, false, 'Pack-size conversion configurable', 140, NOW()),
  ('inv_cable_6core_roll', 'CABLE_6CORE_ROLL', '6core Cable Roll 1000m', 'Cable', 'Roll (1000m)', 'Meter', 1000, false, true, '1 roll = 1000 m; decimal metres', 150, NOW()),
  ('inv_splitter_8way_blockless_sc', 'SPLITTER_8WAY_BLOCKLESS_SC', '8way Blockless Splitter SC', 'Splitter', 'Unit', 'Unit', 1, false, false, NULL, 160, NOW()),
  ('inv_screw_black', 'SCREW_BLACK', 'Black Screw', 'Consumable', 'Piece / pack', 'Piece', 1, false, false, NULL, 170, NOW()),
  ('inv_cable_clips', 'CABLE_CLIPS', 'Cable Clips', 'Consumable', 'Piece / pack', 'Piece', 1, false, false, NULL, 180, NOW()),
  ('inv_cable_tie', 'CABLE_TIE', 'Cable Tie', 'Consumable', 'Piece / pack', 'Piece', 1, false, false, NULL, 190, NOW()),
  ('inv_casing_50x50', 'CASING_50X50', 'Casing w 50mm h50mm', 'Casing', 'Length / pack', 'Meter', 1, false, true, 'Metres when cut/issued by length', 200, NOW()),
  ('inv_cable_cat5_roll', 'CABLE_CAT5_ROLL', 'Cat-5 cable Roll (305M)', 'Cable', 'Roll (305m)', 'Meter', 305, false, true, '1 roll = 305 m; decimal metres', 210, NOW()),
  ('inv_cable_cat6', 'CABLE_CAT6', 'Cat-6 cable Roll (M)', 'Cable', 'Roll / Meter', 'Meter', 1, false, true, 'Set conversion to the actual roll length', 220, NOW()),
  ('inv_ethernet_boot', 'ETHERNET_BOOT', 'Ethernet Connector/boot', 'Connector', 'Piece / pack', 'Piece', 1, false, false, NULL, 230, NOW()),
  ('inv_f_joint', 'F_JOINT', 'F-Joint', 'Connector', 'Piece', 'Piece', 1, false, false, NULL, 240, NOW()),
  ('inv_fast_connector_apc', 'FAST_CONNECTOR_APC', 'Fast Connector (APC)', 'Fiber connector', 'Piece', 'Piece', 1, false, false, NULL, 250, NOW()),
  ('inv_fast_connector_upc', 'FAST_CONNECTOR_UPC', 'Fast Connector (UPC)', 'Fiber connector', 'Piece', 'Piece', 1, false, false, NULL, 260, NOW()),
  ('inv_fiber_adaptor_lc', 'FIBER_ADAPTOR_LC', 'Fiber Adaptor (LC)', 'Fiber adaptor', 'Piece', 'Piece', 1, false, false, NULL, 270, NOW()),
  ('inv_fiber_adaptor_sc', 'FIBER_ADAPTOR_SC', 'Fiber Adaptor (SC)', 'Fiber adaptor', 'Piece', 'Piece', 1, false, false, NULL, 280, NOW()),
  ('inv_fiber_ground_joint_big', 'FIBER_GROUND_JOINT_BIG', 'Fiber Ground Joint (big)', 'Fiber joint', 'Piece', 'Piece', 1, false, false, NULL, 290, NOW()),
  ('inv_glue_stick', 'GLUE_STICK', 'Glue Stick', 'Consumable', 'Piece / pack', 'Piece', 1, false, false, NULL, 300, NOW()),
  ('inv_patch_lcapc_3m', 'PATCH_LCAPC_3M', 'LC/APC Patch cord 3M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 310, NOW()),
  ('inv_patch_lcapc_1m', 'PATCH_LCAPC_1M', 'LC/APC Patch cord 1M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 320, NOW()),
  ('inv_patch_lcapc_2m', 'PATCH_LCAPC_2M', 'LC/APC Patch cord 2M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 330, NOW()),
  ('inv_patch_scupc_3m', 'PATCH_SCUPC_3M', 'SC/UPC Patch cord 3M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 340, NOW()),
  ('inv_patch_scupc_2m', 'PATCH_SCUPC_2M', 'SC/UPC Patch cord 2M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 350, NOW()),
  ('inv_patch_scupc_1m', 'PATCH_SCUPC_1M', 'SC/UPC Patch cord 1M', 'Patch cord', 'Unit', 'Unit', 1, false, false, NULL, 360, NOW()),
  ('inv_screw_anchor', 'SCREW_ANCHOR', 'Mukolhu (Screw Anchor)', 'Consumable', 'Piece / pack', 'Piece', 1, false, false, NULL, 370, NOW()),
  ('inv_ont_ooredoo', 'ONT_OOREDOO', 'ONT (ooredoo)', 'ONT / serialized device', 'Unit', 'Unit', 1, true, false, 'Serial mandatory', 380, NOW()),
  ('inv_ont_10g_dual_band', 'ONT_10G_DUAL_BAND', 'ONT 10G Dual Band with Adapter', 'ONT / serialized device', 'Unit', 'Unit', 1, true, false, 'Serial mandatory', 390, NOW()),
  ('inv_ont_dual_band', 'ONT_DUAL_BAND', 'ONT Dual Band with Adapter', 'ONT / serialized device', 'Unit', 'Unit', 1, true, false, 'Serial mandatory', 400, NOW()),
  ('inv_cable_outdoor_4024m_2core', 'CABLE_OUTDOOR_4024M_2CORE', 'Outdoor 4024M 2core Cable', 'Cable', 'Roll / Meter', 'Meter', 1, false, true, 'Decimal metres allowed', 410, NOW()),
  ('inv_pigtail_lc', 'PIGTAIL_LC', 'Pigtail (LC)', 'Fiber accessory', 'Piece', 'Piece', 1, false, false, NULL, 420, NOW()),
  ('inv_rj45_connector', 'RJ45_CONNECTOR', 'RJ45 Connector', 'Connector', 'Piece / pack', 'Piece', 1, false, false, NULL, 430, NOW()),
  ('inv_insulation_tape', 'INSULATION_TAPE', 'Insulation tape', 'Consumable', 'Roll', 'Roll', 1, false, false, NULL, 440, NOW())
ON CONFLICT ("code") DO NOTHING;
