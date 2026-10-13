/**
 * Phase 2 initial inventory item master (spec §7). Codes are stable identifiers;
 * names, UOMs and flags stay editable from the admin item master.
 */
export type SeedInventoryItem = {
  code: string;
  name: string;
  category: string;
  stock_uom: string;
  consumption_uom: string;
  conversion_factor?: number;
  serialized?: boolean;
  allow_decimal?: boolean;
  notes?: string;
};

const unit = (
  code: string,
  name: string,
  category: string,
): SeedInventoryItem => ({
  code,
  name,
  category,
  stock_uom: 'Unit',
  consumption_uom: 'Unit',
});

const piece = (
  code: string,
  name: string,
  category: string,
  stock = 'Piece / pack',
): SeedInventoryItem => ({
  code,
  name,
  category,
  stock_uom: stock,
  consumption_uom: 'Piece',
});

const ont = (code: string, name: string): SeedInventoryItem => ({
  code,
  name,
  category: 'ONT / serialized device',
  stock_uom: 'Unit',
  consumption_uom: 'Unit',
  serialized: true,
  notes: 'Serial mandatory',
});

export const INVENTORY_ITEMS: SeedInventoryItem[] = [
  unit('BOX_12C', '12C Box', 'Enclosure / box'),
  unit('PATCH_1M_APC', '1M Patch Code APC', 'Patch cord'),
  unit('BOX_24C', '24C Box', 'Enclosure / box'),
  unit('BOX_2C', '2C Box', 'Enclosure / box'),
  {
    code: 'CABLE_2CORE',
    name: '2core Cable Roll 1 meter',
    category: 'Cable',
    stock_uom: 'Meter',
    consumption_uom: 'Meter',
    allow_decimal: true,
    notes: 'Decimal metres allowed',
  },
  unit('PATCH_2M_LC', '2M Patch Code (LC)', 'Patch cord'),
  unit('PATCH_2M_SCAPC_SCUPC', '2M patch code (SC APC - SC UPC)', 'Patch cord'),
  unit('SPLITTER_2WAY', '2way Splitter', 'Splitter'),
  unit('BOX_4C', '4C Box', 'Enclosure / box'),
  unit('BOX_4M', '4M Box', 'Enclosure / box'),
  unit('SPLITTER_4WAY_BLOCK_LC', '4way Block LC Splitter', 'Splitter'),
  unit('SPLITTER_4WAY_BLOCK_SC', '4way Block SC splitter', 'Splitter'),
  unit('SPLITTER_4WAY_BLOCKLESS_SC', '4way Blockless SC Splitter', 'Splitter'),
  {
    ...piece('CLIP_5MM', '5mm Clip (Box)', 'Consumable', 'Box'),
    notes: 'Pack-size conversion configurable',
  },
  {
    code: 'CABLE_6CORE_ROLL',
    name: '6core Cable Roll 1000m',
    category: 'Cable',
    stock_uom: 'Roll (1000m)',
    consumption_uom: 'Meter',
    conversion_factor: 1000,
    allow_decimal: true,
    notes: '1 roll = 1000 m; decimal metres',
  },
  unit('SPLITTER_8WAY_BLOCKLESS_SC', '8way Blockless Splitter SC', 'Splitter'),
  piece('SCREW_BLACK', 'Black Screw', 'Consumable'),
  piece('CABLE_CLIPS', 'Cable Clips', 'Consumable'),
  piece('CABLE_TIE', 'Cable Tie', 'Consumable'),
  {
    code: 'CASING_50X50',
    name: 'Casing w 50mm h50mm',
    category: 'Casing',
    stock_uom: 'Length / pack',
    consumption_uom: 'Meter',
    allow_decimal: true,
    notes: 'Metres when cut/issued by length',
  },
  {
    code: 'CABLE_CAT5_ROLL',
    name: 'Cat-5 cable Roll (305M)',
    category: 'Cable',
    stock_uom: 'Roll (305m)',
    consumption_uom: 'Meter',
    conversion_factor: 305,
    allow_decimal: true,
    notes: '1 roll = 305 m; decimal metres',
  },
  {
    code: 'CABLE_CAT6',
    name: 'Cat-6 cable Roll (M)',
    category: 'Cable',
    stock_uom: 'Roll / Meter',
    consumption_uom: 'Meter',
    allow_decimal: true,
    notes: 'Set conversion to the actual roll length',
  },
  piece('ETHERNET_BOOT', 'Ethernet Connector/boot', 'Connector'),
  piece('F_JOINT', 'F-Joint', 'Connector', 'Piece'),
  piece(
    'FAST_CONNECTOR_APC',
    'Fast Connector (APC)',
    'Fiber connector',
    'Piece',
  ),
  piece(
    'FAST_CONNECTOR_UPC',
    'Fast Connector (UPC)',
    'Fiber connector',
    'Piece',
  ),
  piece('FIBER_ADAPTOR_LC', 'Fiber Adaptor (LC)', 'Fiber adaptor', 'Piece'),
  piece('FIBER_ADAPTOR_SC', 'Fiber Adaptor (SC)', 'Fiber adaptor', 'Piece'),
  piece(
    'FIBER_GROUND_JOINT_BIG',
    'Fiber Ground Joint (big)',
    'Fiber joint',
    'Piece',
  ),
  piece('GLUE_STICK', 'Glue Stick', 'Consumable'),
  unit('PATCH_LCAPC_3M', 'LC/APC Patch cord 3M', 'Patch cord'),
  unit('PATCH_LCAPC_1M', 'LC/APC Patch cord 1M', 'Patch cord'),
  unit('PATCH_LCAPC_2M', 'LC/APC Patch cord 2M', 'Patch cord'),
  unit('PATCH_SCUPC_3M', 'SC/UPC Patch cord 3M', 'Patch cord'),
  unit('PATCH_SCUPC_2M', 'SC/UPC Patch cord 2M', 'Patch cord'),
  unit('PATCH_SCUPC_1M', 'SC/UPC Patch cord 1M', 'Patch cord'),
  piece('SCREW_ANCHOR', 'Mukolhu (Screw Anchor)', 'Consumable'),
  ont('ONT_OOREDOO', 'ONT (ooredoo)'),
  ont('ONT_10G_DUAL_BAND', 'ONT 10G Dual Band with Adapter'),
  ont('ONT_DUAL_BAND', 'ONT Dual Band with Adapter'),
  {
    code: 'CABLE_OUTDOOR_4024M_2CORE',
    name: 'Outdoor 4024M 2core Cable',
    category: 'Cable',
    stock_uom: 'Roll / Meter',
    consumption_uom: 'Meter',
    allow_decimal: true,
    notes: 'Decimal metres allowed',
  },
  piece('PIGTAIL_LC', 'Pigtail (LC)', 'Fiber accessory', 'Piece'),
  piece('RJ45_CONNECTOR', 'RJ45 Connector', 'Connector'),
  {
    code: 'INSULATION_TAPE',
    name: 'Insulation tape',
    category: 'Consumable',
    stock_uom: 'Roll',
    consumption_uom: 'Roll',
  },
];
