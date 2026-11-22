// Adversarial corpus: 12 synthetic scenarios with planted sensitive markers.
// All data is made up. Each marker says what we expect:
//   hide — must not appear in the output
//   flag — must be hidden OR listed in report.review for the user to decide
// "keep" lists what must survive so the AI can still debug (usefulness).
module.exports = [
  {
    id: 'java-business-message',
    text: [
      'java.lang.IllegalStateException: partner SilverOrchidPartner violated unpublished 14.5% payout threshold',
      '\tat com.novaforge.claims.RulePilot.reconcile(RulePilot.java:88)',
      '\tat org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1089)',
    ].join('\n'),
    markers: [['SilverOrchidPartner', 'hide'], ['14.5%', 'flag'], ['unpublished', 'flag'], ['novaforge', 'hide'], ['RulePilot', 'hide']],
    keep: ['java.lang.IllegalStateException', '.java:88)', 'org.springframework.web.servlet.DispatcherServlet.doDispatch'],
  },
  {
    id: 'prose-business-rule',
    text: 'Decline all VegaPrime clients above 7 percent.',
    markers: [['VegaPrime', 'hide'], ['7 percent', 'flag']],
    keep: ['Decline all', 'clients above'],
  },
  {
    id: 'json-config',
    text: JSON.stringify({ operation: 'calculateRebate', tier: 'lotus-platinum', discount_formula: 'base * 0.63', customer: 'VegaPrime', region: 'us-east-1', timeout_ms: 3000, enabled: true }, null, 2),
    markers: [['calculateRebate', 'hide'], ['lotus-platinum', 'hide'], ['base * 0.63', 'flag'], ['VegaPrime', 'hide']],
    keep: ['"operation"', '"tier"', '"discount_formula"', '"region": "us-east-1"', '"timeout_ms": 3000', '"enabled": true'],
    json: true,
  },
  {
    id: 'sql',
    text: "SELECT client_name, royalty_rate\nFROM secret_partner_rates\nWHERE client_name = 'VegaPrime'\nAND royalty_rate > 0.17;",
    markers: [['secret_partner_rates', 'hide'], ['VegaPrime', 'hide'], ['0.17', 'flag'], ['royalty_rate', 'hide']],
    keep: ['SELECT', 'FROM', 'WHERE', 'AND', '> '],
  },
  {
    id: 'js-source',
    text: "const privateClient = 'BlueOtter';\n\nfunction computeQuietDiscount(customer) {\n  if (customer === 'BlueOtter') return 0.41;\n}",
    markers: [['BlueOtter', 'hide'], ['computeQuietDiscount', 'hide'], ['privateClient', 'hide'], ['0.41', 'flag']],
    keep: ['const ', 'function ', 'if (customer === ', 'return '],
  },
  {
    id: 'k8s-yaml',
    text: [
      'apiVersion: apps/v1',
      'kind: Deployment',
      'metadata:',
      '  name: nebula-billing',
      '  annotations:',
      '    rollout.corp/strategy: sierra-flash-rollout',
      'spec:',
      '  replicas: 3',
      '  template:',
      '    spec:',
      '      containers:',
      '        - name: nebula-billing',
      '          image: registry.novaforge.internal/payments/nebula-billing:4.2.1',
      '          ports:',
      '            - containerPort: 8080',
      '          env:',
      '            - name: PARTNER_POLICY',
      '              value: "Decline VegaPrime above 7 percent"',
    ].join('\n'),
    markers: [['nebula-billing', 'hide'], ['sierra-flash-rollout', 'hide'], ['VegaPrime', 'hide'], ['registry.novaforge.internal', 'hide'], ['7 percent', 'flag']],
    keep: ['apiVersion: apps/v1', 'kind: Deployment', 'replicas: 3', 'containerPort: 8080', ':4.2.1'],
    yaml: true,
  },
  {
    id: 'slack-message',
    text: 'We agreed to quietly sunset the AzureFawn account on December 4; do not tell customers yet.\nProject OrchidSand has a 38% margin problem.',
    markers: [['AzureFawn', 'hide'], ['OrchidSand', 'hide'], ['do not tell customers', 'flag'], ['38%', 'flag']],
    keep: ['December 4', 'margin problem'],
  },
  {
    id: 'ci-cd-log',
    text: [
      '2026-11-20T10:01:02Z ##[group]Deploy',
      '2026-11-20T10:01:03Z Deploying helios-risk-engine:2.3.1 to prod-eu',
      '2026-11-20T10:01:09Z Pulling registry.novaforge.internal/risk/helios-risk-engine:2.3.1',
      '2026-11-20T10:01:40Z Warning: policy SapphirePartnerThreshold blocked rollout',
      '2026-11-20T10:01:41Z Error: ImagePullBackOff (exit code 1)',
    ].join('\n'),
    markers: [['helios-risk-engine', 'hide'], ['SapphirePartnerThreshold', 'hide'], ['registry.novaforge.internal', 'hide']],
    keep: ['Error: ImagePullBackOff', 'exit code 1', ':2.3.1'],
  },
  {
    id: 'python-traceback',
    text: [
      'Traceback (most recent call last):',
      '  File "/srv/novaforge/claims/limits.py", line 42, in enforce_chargeback_cap',
      '    raise ValueError(f"partner {name} exceeded {cap}% chargeback limit")',
      'ValueError: partner RedOtter exceeded 17.4% chargeback limit',
    ].join('\n'),
    markers: [['RedOtter', 'hide'], ['17.4%', 'flag'], ['novaforge', 'hide'], ['enforce_chargeback_cap', 'hide']],
    keep: ['Traceback (most recent call last):', 'line 42', 'ValueError:'],
  },
  {
    id: 'email-ticket',
    text: 'From: dana.kim@novaforge.com\nSubject: CLM-4821 renewal\n\nAzurePeak wants the renewal at $1.2M; finance says hold until Q1. Internal only.',
    markers: [['dana.kim@novaforge.com', 'hide'], ['CLM-4821', 'hide'], ['AzurePeak', 'hide'], ['$1.2M', 'flag'], ['Internal only', 'flag']],
    keep: ['Subject:', 'renewal'],
  },
  {
    id: 'terminal-git',
    text: [
      'dkim@novaforge-mbp claims-engine % git push origin main',
      "fatal: unable to access 'https://git.novaforge.internal/claims/rule-pilot.git/': SSL certificate problem",
    ].join('\n'),
    markers: [['dkim', 'hide'], ['novaforge-mbp', 'hide'], ['claims-engine', 'hide'], ['git.novaforge.internal', 'hide'], ['rule-pilot', 'hide']],
    keep: ['git push origin main', 'SSL certificate problem'],
  },
  {
    id: 'dotenv',
    text: [
      'DATABASE_URL=postgres://claims_svc:Pa55w0rd!@db.novaforge.internal:5432/claims',
      'STRIPE_SECRET_KEY=sk_live_51HxQjRkEXAMPLEexampleEXAMPLE00',
      'PARTNER_NAME=SilverOrchid',
      'FEATURE_VEGA_DISCOUNT_RATE=0.12',
      'LOG_LEVEL=debug',
    ].join('\n'),
    markers: [['Pa55w0rd!', 'hide'], ['db.novaforge.internal', 'hide'], ['sk_live_51HxQjRkEXAMPLE', 'hide'], ['SilverOrchid', 'hide'], ['0.12', 'flag']],
    keep: ['DATABASE_URL=postgres://', ':5432/', 'LOG_LEVEL=debug'],
  },
];
