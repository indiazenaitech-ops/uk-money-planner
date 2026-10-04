/* Plain-English meanings used by MP.term(key) and MP.explain(key). Keys are lower case. */
window.MP_GLOSSARY = (function () {
  var g = {};
  function d(key, term, text) { g[key] = { term: term, text: text }; }
  // Saving
  d('isa', 'ISA', 'An Individual Savings Account. Any interest or growth inside it is free from UK tax. You can put in up to £20,000 each tax year across all your ISAs.');
  d('cash-isa', 'Cash ISA', 'A savings account with no tax on the interest. Your money is not invested, so it will not fall in value.');
  d('ss-isa', 'Stocks and shares ISA', 'An ISA that holds investments such as funds or shares. Growth and income are tax-free, but the value can go down as well as up.');
  d('lisa', 'Lifetime ISA', 'For people aged 18 to 39. Save up to £4,000 a year and the government adds 25%. Use it for a first home up to £450,000 or from age 60. Taking money out for anything else costs 25%.');
  d('jisa', 'Junior ISA', 'A tax-free savings or investment account for a child. Up to £9,000 a year. The child can take the money at 18.');
  d('aer', 'AER', 'Annual Equivalent Rate. The interest you would earn in a year, including interest on interest. Use it to compare savings accounts.');
  d('apr', 'APR', 'Annual Percentage Rate. The yearly cost of borrowing, including interest and most fees. Use it to compare loans and cards.');
  d('emergency-fund', 'Emergency fund', 'Money set aside for surprises such as a broken boiler or losing your job. Most people aim for 3 to 6 months of essential spending in an easy-access account.');
  d('fscs', 'FSCS', 'The Financial Services Compensation Scheme. If a UK bank fails, it protects up to £120,000 per person, per banking licence.');
  d('psa', 'Personal Savings Allowance', 'The interest you can earn outside an ISA each year without paying tax on it: £1,000 for basic-rate taxpayers, £500 for higher-rate and £0 for additional-rate.');
  d('compound-interest', 'Compound interest', 'Earning interest on your interest. Over many years it makes savings and investments grow faster.');
  d('inflation', 'Inflation', 'Prices rising over time. If prices rise 2.5% a year, £100 today buys about £78 worth of things in 10 years.');
  // Investing
  d('investing', 'Investing', 'Putting money into things like company shares or bonds, hoping it grows more than cash over 5 or more years. Its value can fall as well as rise.');
  d('fund', 'Fund', 'A ready-made mix of many investments, managed for you. Spreading your money this way lowers the risk of any one company doing badly.');
  d('diversification', 'Diversification', 'Spreading your money across many investments, so one going badly does not hurt too much.');
  d('charges', 'Charges', 'Fees for a platform and the funds you hold, usually a yearly percentage. Even 0.5% a year adds up to a lot over decades.');
  d('risk-attitude', 'Attitude to risk', 'How comfortable you are with the value of your investments going up and down. Higher risk can mean higher growth over time, but bigger falls along the way.');
  d('gia', 'General investment account', 'An investment account without the ISA tax benefits. Gains and dividends above your allowances may be taxed.');
  d('dividend', 'Dividend', 'A share of a company\'s profit paid to people who own its shares.');
  d('cgt', 'Capital Gains Tax', 'Tax on the profit when you sell something that has gone up in value, such as shares outside an ISA or a second home. The first £3,000 of gains each year is tax-free.');
  // Pensions
  d('pension', 'Pension', 'A long-term savings pot for retirement. You get tax relief on what you pay in, but usually cannot take the money until age 55 (57 from 2028).');
  d('workplace-pension', 'Workplace pension', 'A pension your employer sets up. Most employees are automatically enrolled, and your employer must pay in too.');
  d('auto-enrolment', 'Auto-enrolment', 'The law that puts most employees into a workplace pension. The minimum is 8% of qualifying earnings: usually 5% from you and 3% from your employer.');
  d('sipp', 'SIPP', 'A Self-Invested Personal Pension. A pension you open yourself, where you choose the investments.');
  d('tax-relief', 'Tax relief', 'Money the government adds to your pension. For a basic-rate taxpayer, £80 paid in becomes £100.');
  d('salary-sacrifice', 'Salary sacrifice', 'Giving up some salary in return for your employer paying it into your pension. You save income tax and National Insurance.');
  d('state-pension', 'State Pension', 'A regular payment from the government once you reach State Pension age. The full new State Pension needs 35 qualifying years of National Insurance.');
  d('qualifying-years', 'Qualifying years', 'Years in which you paid or were credited with National Insurance. You need 10 to get any State Pension and 35 for the full amount.');
  d('annuity', 'Annuity', 'Using your pension pot to buy a guaranteed income for life. It does not run out, but you usually cannot change your mind.');
  d('drawdown', 'Drawdown', 'Keeping your pension invested and taking money out as you need it. It stays flexible, but it can run out if you take too much or investments fall.');
  d('tax-free-lump-sum', 'Tax-free lump sum', 'Usually 25% of your pension can be taken tax-free, up to £268,275 in total. The rest is taxed as income.');
  // Tax and pay
  d('personal-allowance', 'Personal Allowance', 'The income you can earn each year before paying income tax: £12,570. It shrinks if you earn over £100,000.');
  d('tax-code', 'Tax code', 'A code on your payslip, such as 1257L, that tells your employer how much tax-free pay you get. A wrong code can mean paying the wrong tax.');
  d('national-insurance', 'National Insurance', 'A tax on earnings that builds your right to the State Pension and some benefits.');
  d('self-assessment', 'Self Assessment', 'The yearly tax return you send HMRC if you are self-employed or have income that is not taxed at source. The online deadline is 31 January.');
  d('payments-on-account', 'Payments on account', 'Advance payments towards next year\'s tax bill for people in Self Assessment, due on 31 January and 31 July.');
  // Borrowing and homes
  d('ltv', 'Loan to value', 'How much you borrow compared with the home\'s value. A £180,000 mortgage on a £200,000 home is 90% LTV. Lower LTVs usually get better rates.');
  d('svr', 'Standard variable rate', 'The rate many mortgages move to when a fixed or tracker deal ends. It is usually much higher, so it pays to switch before your deal ends.');
  d('fixed-rate', 'Fixed rate', 'A mortgage or loan whose interest rate stays the same for a set time, so your payments do not change.');
  d('overpayment', 'Overpayment', 'Paying more than you must. On a mortgage it cuts interest and the time left. Most deals let you overpay 10% a year without a fee.');
  d('erc', 'Early repayment charge', 'A fee for paying off a mortgage or loan early, or overpaying more than allowed during a deal.');
  d('stamp-duty', 'Stamp Duty', 'A tax when you buy a home in England or Northern Ireland. First-time buyers pay none on the first £300,000 of a home up to £500,000.');
  d('credit-score', 'Credit score', 'A number lenders use to judge how likely you are to repay. Paying on time and staying on the electoral roll help it.');
  d('direct-debit', 'Direct Debit', 'Permission for a company to take payments from your account. The Direct Debit Guarantee protects you if they take the wrong amount.');
  // Protection and estate
  d('life-insurance', 'Life insurance', 'Pays out if you die during the policy, to support the people who depend on you or clear a mortgage.');
  d('income-protection', 'Income protection', 'Pays part of your income if you cannot work because of illness or injury, until you can go back to work or the policy ends.');
  d('critical-illness', 'Critical illness cover', 'Pays a lump sum if you are diagnosed with a serious illness listed in the policy.');
  d('death-in-service', 'Death-in-service', 'A workplace benefit that pays a lump sum, often 2 to 4 times your salary, if you die while employed there.');
  d('iht', 'Inheritance tax', 'Tax on the estate of someone who has died. Usually 40% on the amount above the tax-free allowances (£325,000, plus up to £175,000 when a home goes to children or grandchildren).');
  d('will', 'Will', 'A legal document saying who gets your money and belongings when you die. Without one, the law decides.');
  d('lpa', 'Lasting power of attorney', 'A legal document letting someone you trust make decisions for you if you cannot, about money or about health.');
  d('net-worth', 'Net worth', 'Everything you own minus everything you owe.');
  // Advice
  d('adviser', 'Financial adviser', 'A professional, regulated by the FCA, who recommends what you should do based on your situation. Advice usually costs money. Guidance, like this app and MoneyHelper, is free but does not tell you what to do.');
  d('independent-adviser', 'Independent adviser', 'An adviser who can recommend products from the whole market. A "restricted" adviser only looks at some products or providers.');
  return g;
})();
