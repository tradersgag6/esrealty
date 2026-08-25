const fs=require("fs");const t=fs.readFileSync("C:/Users/Home-Desktop/Desktop/project 1/es realty/js/app.js","utf8");
function p(n,l){const i=t.indexOf(n);console.log("== "+n+" ==\n"+(i>=0?t.slice(i,i+l).replace(/\s+/g," ").slice(0,l):"NF")+"\n");}
p('state.transactions.push',700);
p('TX_STATUSES',300);
p('function renderTransactions',600);