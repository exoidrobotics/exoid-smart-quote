// DEMO DATA ONLY. Every name, price, rate, term and text below is made up for trying the app.
// Real catalog, prices, presets, bank details and document wording are imported after login into the private Sheet.

const SYS = [
  ['general', 'General requirements', 'lot', 'Mobilization, supervision and project management'],
  ['server', 'Server and network', 'lot', 'Local automation server, network switch and access points'],
  ['lighting', 'Smart lighting', 'lot', 'Smart switches for lighting control'],
  ['climate', 'Smart climate', 'lot', 'Air-conditioner control'],
  ['locks', 'Smart door locks', 'lot', 'Keyless door locks'],
  ['covers', 'Smart covers', 'lot', 'Motorized curtains and blinds'],
  ['panel', 'Interactive control panel', 'lot', 'Wall-mounted touch panels'],
  ['presence', 'Presence sensors', 'lot', 'Occupancy detection for automations'],
  ['alarm', 'Entry and alarm system', 'lot', 'Door and window sensors with alarm'],
  ['voice', 'Voice command', 'lot', 'Voice assistant speakers'],
  ['cctv', 'Surveillance cameras (CCTV)', 'lot', 'IP cameras with recorder'],
  ['gate', 'Smart automatic gate', 'lot', 'Gate motor and access control'],
  ['wifi', 'Wi-Fi system', 'lot', 'Whole-house Wi-Fi coverage'],
  ['film', 'Smart film (switchable glass)', 'lot', 'Switchable privacy film'],
  ['wiring', 'Supplementary wiring', 'lot', 'Conduits, wires and power leads'],
];

let n = 0;
const item = (system, kind, name, unit, unitCost, brand = '') => ({ id: 'cat_demo_' + (++n), system, kind, name, brand, model: '', unit, unitCost, active: true, notes: '' });

export function demoData() {
  n = 0;
  const catalog = [
    item('general', 'material', 'Transportation and hauling (demo)', 'lot', 5000),
    item('general', 'material', 'Project supervision (demo)', 'day', 900),
    item('general', 'equipment', 'Service vehicle (demo)', 'day', 300),
    item('server', 'material', 'Mini PC automation server (demo)', 'pc', 18000),
    item('server', 'material', 'Gigabit network switch, 8-port (demo)', 'pc', 2500),
    item('server', 'material', 'Zigbee coordinator (demo)', 'pc', 2200),
    item('server', 'labor', 'IT specialist (demo)', 'man-day', 900),
    item('lighting', 'material', 'Smart switch, 1-gang (demo)', 'pc', 950),
    item('lighting', 'material', 'Smart switch, 2-gang (demo)', 'pc', 1050),
    item('lighting', 'material', 'Smart switch, 3-gang (demo)', 'pc', 1150),
    item('lighting', 'labor', 'Skilled electrician (demo)', 'man-outlet', 700),
    item('climate', 'material', 'IR air-conditioner controller (demo)', 'pc', 1400),
    item('climate', 'labor', 'Skilled technician (demo)', 'man-device', 350),
    item('locks', 'material', 'Smart door lock, fingerprint + PIN (demo)', 'pc', 15000),
    item('locks', 'labor', 'Skilled technician (demo)', 'man-day', 800),
    item('covers', 'material', 'Smart curtain motor (demo)', 'pc', 2800),
    item('covers', 'material', 'Curtain rail (demo)', 'm', 700),
    item('panel', 'material', '10-inch wall tablet (demo)', 'pc', 12000),
    item('presence', 'material', 'mmWave presence sensor (demo)', 'pc', 1500),
    item('alarm', 'material', 'Door/window contact sensor (demo)', 'pc', 750),
    item('alarm', 'material', 'Indoor siren (demo)', 'pc', 1800),
    item('voice', 'material', 'Smart speaker (demo)', 'pc', 3200),
    item('cctv', 'material', '4MP PoE bullet camera (demo)', 'pc', 3300),
    item('cctv', 'material', '8-channel network video recorder (demo)', 'pc', 5800),
    item('cctv', 'material', '1 TB surveillance hard drive (demo)', 'pc', 2900),
    item('wifi', 'material', 'Wi-Fi 6 ceiling access point (demo)', 'pc', 4500),
    item('wiring', 'material', 'Electrical wire, 2.0 mm² (demo)', 'roll', 2600),
    item('wiring', 'material', 'PVC conduit, 20 mm (demo)', 'length', 90),
    item('general', 'equipment', 'Miscellaneous tools (demo)', 'day', 600),
  ];
  const byName = (s) => catalog.find((c) => c.name.startsWith(s)).id;
  const packages = [
    { id: 'pkg_demo_1', name: 'Smart lighting, 3-bedroom house (demo)', system: 'lighting', lines: [
      { catalogId: byName('Smart switch, 1-gang'), qty: 8 }, { catalogId: byName('Smart switch, 2-gang'), qty: 4 },
      { catalogId: byName('Smart switch, 3-gang'), qty: 2 }, { catalogId: byName('Skilled electrician'), qty: 14 },
      { catalogId: byName('Miscellaneous tools'), qty: 3 }] },
    { id: 'pkg_demo_2', name: '4-camera CCTV (demo)', system: 'cctv', lines: [
      { catalogId: byName('4MP PoE'), qty: 4 }, { catalogId: byName('8-channel'), qty: 1 }, { catalogId: byName('1 TB'), qty: 1 },
      { catalogId: byName('Miscellaneous tools'), qty: 2 }] },
  ];
  const settings = {
    company: { name: 'Exoid Robotics', legalName: 'Exoid Robotics (demo legal name)', address: 'Demo address, set in Settings', phone: '+63 900 000 0000', email: 'demo@example.com', website: 'www.exoidrobotics.com', logo: '' },
    signatories: [{ id: 'sig_demo_1', name: 'Engr. Demo Preparer', position: 'Project Engineer' }, { id: 'sig_demo_2', name: 'Demo Director', position: 'Managing Director' }],
    bank: { bank: 'Demo Bank', accountName: 'Demo Account Name', accountNumber: '0000-0000-0000', notes: '' },
    defaults: { validityDays: 30, quotePrefix: 'EXR', nextNumber: 1, projectTypes: ['Smart home', 'Custom smart home', 'Commercial', 'Government'] },
    systemTypes: SYS.map(([key, name, unit, description]) => ({ key, name, unit, description, clientDescription: `${description}. (Demo client-friendly description: write yours in Settings.)` })),
    markupPresets: [
      { id: 'mp_demo_1', name: 'Demo: OCM 8% + CP 12%', markups: [{ code: 'OCM', label: 'OCM (Overhead, Miscellaneous & Contingencies)', pct: 8 }, { code: 'CP', label: "CP (Contractor's Profit)", pct: 12 }] },
      { id: 'mp_demo_2', name: 'Demo: CP 15% only', markups: [{ code: 'CP', label: "CP (Contractor's Profit)", pct: 15 }] },
      { id: 'mp_demo_0', name: 'No markup', markups: [] },
    ],
    paymentPresets: [
      { id: 'pp_demo_1', name: 'Demo: 50 / 25 / 25', stages: [{ name: 'Down payment', pct: 50, due: 'Upon contract signing' }, { name: 'Delivery of materials', pct: 25, due: 'Upon delivery to site' }, { name: 'Turnover', pct: 25, due: 'Upon completion and turnover' }] },
      { id: 'pp_demo_2', name: 'Demo: 100% on completion', stages: [{ name: 'Full payment', pct: 100, due: 'Upon completion and turnover' }] },
    ],
    texts: {
      proposalIntro: 'This proposal covers the design, supply, installation and configuration of the systems listed below for {{project.name}}. (Demo text.)',
      warrantyPeriod: '6 months',
      warranty: 'Demo warranty text. The real wording is imported into Settings. Warranty period: {{warrantyPeriod}} from turnover.',
      exclusions: 'Demo exclusions text. The real wording is imported into Settings.',
      proposalClosing: 'Thank you for considering Exoid Robotics. (Demo text.)',
    },
    contract: { title: 'Smart Home Installation Contract', clauses: [
      { title: 'Parties', body: 'This agreement is made on {{date}} between {{company.legalName}} (Contractor) and {{client.name}} (Client) for the project at {{project.address}}. (Demo text.)' },
      { title: 'Scope of work', body: 'The Contractor will design, supply and install:\n{{scopeList}}\nas detailed in Exhibit A (Bill of Quantities) and Exhibit B (Detailed Unit Price Analysis).' },
      { title: 'Payment terms', body: 'The total contract price is {{total}} (VAT exclusive), payable as follows:\n{{paymentList}}' },
      { title: 'Warranty', body: '{{warranty}}' },
      { title: 'Demo clause', body: 'Replace these demo clauses with your own contract wording in Settings.' },
    ] },
  };
  return { settings, catalog, packages, quotes: {}, revisions: {}, trash: [] };
}

export function demoQuote(settings, catalog) {
  const c = (s) => catalog.find((x) => x.name.startsWith(s));
  const line = (s, qty, extra = {}) => { const it = c(s); return { id: 'ln_' + Math.random().toString(36).slice(2, 9), kind: it.kind, name: it.name, unit: it.unit, unitCost: it.unitCost, qty, location: '', catalogId: it.id, people: 1, ...extra }; };
  const st = (k) => settings.systemTypes.find((s) => s.key === k);
  const sys = (k, lines, extra = {}) => ({ id: 'sys_' + k, key: k, name: st(k).name, description: st(k).description, clientDescription: st(k).clientDescription, unit: 'lot', qty: 1, enabled: true, where: '', lines, ...extra });
  return {
    client: { name: 'Juan and Maria Dela Paz (demo)', address: '123 Example Street, Sample Village, Example City', phone: '', email: '' },
    project: { name: 'Sample Residence Smart Home (demo)', address: '123 Example Street, Sample Village, Example City', type: 'Smart home' },
    gc: { name: '', rep: '', phone: '', email: '' },
    systems: [
      sys('general', [line('Transportation', 1), line('Project supervision', 20), line('Service vehicle', 10)]),
      sys('lighting', [line('Smart switch, 1-gang', 8, { location: 'Bedrooms, hallway' }), line('Smart switch, 2-gang', 4, { location: 'Living, dining' }), line('Skilled electrician', 12), line('Miscellaneous tools', 3)], { where: 'Living, dining, kitchen, 3 bedrooms, hallway' }),
      sys('cctv', [line('4MP PoE', 4, { location: 'Gate, garage, back yard, side' }), line('8-channel', 1), line('1 TB', 1), line('Miscellaneous tools', 2)]),
    ],
  };
}
