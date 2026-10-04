/* The tool catalogue shown on the home page. Each tool lives in apps/<id>/index.html. */
window.MP_GROUPS = [
  { id: 'plan', title: 'Plan your future' },
  { id: 'grow', title: 'Save and invest' },
  { id: 'manage', title: 'Everyday money' },
  { id: 'protect', title: 'Protect your family' },
  { id: 'life', title: 'Life events' }
];
window.MP_TOOLS = [
  { id: 'health-check', icon: '🩺', title: 'Financial health check', desc: 'Answer 15 quick questions to get a money score and the next steps that matter most for you.', group: 'plan' },
  { id: 'dreams', icon: '🌟', title: 'Dreams & goals', desc: 'Turn the things you want in life into goals with a price, a date and a monthly plan.', group: 'plan' },
  { id: 'retirement', icon: '🏖️', title: 'Retirement planner', desc: 'See what your pensions and State Pension could pay, and the gap to the income you want.', group: 'plan' },
  { id: 'retirement-income', icon: '🪙', title: 'Annuity or drawdown', desc: 'Compare a guaranteed income for life with keeping your pension invested, and see how long it could last.', group: 'plan' },
  { id: 'networth', icon: '📊', title: 'Net worth tracker', desc: 'Add up what you own and what you owe, and watch your wealth grow month by month.', group: 'plan' },
  { id: 'savings', icon: '🐷', title: 'Savings & ISAs', desc: 'Build an emergency fund, compare ISAs and Lifetime ISAs, and track your yearly allowance.', group: 'grow' },
  { id: 'investments', icon: '📈', title: 'Investment growth', desc: 'Project how regular investing could grow, with low, mid and high scenarios, charges and inflation.', group: 'grow' },
  { id: 'budget', icon: '🧾', title: 'Budget from statements', desc: 'Read your bank statement files on this device and see where your money goes each month.', group: 'manage' },
  { id: 'inbox', icon: '✉️', title: 'Money inbox', desc: 'Read saved emails and letters to spot bills, renewals and due dates, then plan for them.', group: 'manage' },
  { id: 'take-home', icon: '💷', title: 'Take-home pay', desc: 'Work out income tax, National Insurance, student loan and pension from your salary.', group: 'manage' },
  { id: 'self-employed', icon: '🧑‍💼', title: 'Self-employed tax', desc: 'Estimate income tax, Class 4 NI and payments on account, and how much to set aside each month.', group: 'manage' },
  { id: 'debt', icon: '🏠', title: 'Mortgage & debt', desc: 'Plan mortgage repayments and overpayments, and pay off cards and loans faster.', group: 'manage' },
  { id: 'protection', icon: '🛡️', title: 'Protection needs', desc: 'See how much life cover and income protection your family would need if the worst happened.', group: 'protect' },
  { id: 'iht', icon: '📜', title: 'Inheritance tax & estate', desc: 'Estimate inheritance tax on your estate, including your home, gifts and pensions from 2027.', group: 'protect' },
  { id: 'family', icon: '👶', title: 'Family money', desc: 'Child Benefit, the high income charge, Tax-Free Childcare, maternity pay and the cost of a new baby.', group: 'life' },
  { id: 'redundancy', icon: '📦', title: 'Redundancy & job loss', desc: 'Work out statutory redundancy pay, tax on a payout and how long your money would last.', group: 'life' }
];
