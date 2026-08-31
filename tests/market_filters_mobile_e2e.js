(async function () {
  var log = [], checks = [], ok;
  window.__msLog = log; window.confirm = () => true;
  setTimeout(function(){ log.push("WD"); window.__msDone = true; }, 90000);
  var wait = ms => new Promise(r => setTimeout(r, ms));
  function maxRight(sel){
    var el=document.querySelector(sel);
    if(!el) return -1;
    var max=0, all=[el].concat(Array.prototype.slice.call(el.querySelectorAll("*")));
    for(var i=0;i<all.length;i++){ var rc=all[i].getBoundingClientRect(); if(rc.right>max) max=rc.right; }
    return max;
  }
  try {
    localStorage.removeItem("esrealty_v1"); localStorage.removeItem("esrealty_user");
    document.querySelector("#auth-role").value="super-admin";
    document.querySelector("#auth-test").click(); await wait(500);
    document.querySelector('[data-view="market"]').click(); await wait(700);
    var vw=document.documentElement.clientWidth;
    var filters=document.querySelector(".ms-filters");
    checks.push({name:"market filter card present", ok:!!filters, detail:filters?"yes":"missing"});
    var off=0, fields=[];
    if(filters){ fields=Array.prototype.slice.call(filters.querySelectorAll(".field")); }
    for(var i=0;i<fields.length;i++){ var r=fields[i].getBoundingClientRect(); if(r.right>vw+1) off++; }
    log.push("vw="+vw+" fields="+fields.length+" overRight="+off);
    checks.push({name:"no market filter field overflows right edge", ok:off===0, detail:off+"/"+fields.length+" past right (vw="+vw+")"});
    var frmax=maxRight(".ms-filters");
    log.push("filters maxRight="+frmax+" vw="+vw);
    checks.push({name:"market filter card fits the viewport", ok:frmax>0&&frmax<=vw+2, detail:"maxRight="+Math.round(frmax)+" vw="+vw});
    var run=document.querySelector("#ms-run");
    var fb=document.querySelector("#ms-facebook-search");
    var fbBelow = !!run&&!!fb && fb.getBoundingClientRect().top > run.getBoundingClientRect().bottom - 1;
    log.push("run.bottom="+(run?run.getBoundingClientRect().bottom:0).toFixed(1)+" fb.top="+(fb?fb.getBoundingClientRect().top:0).toFixed(1));
    checks.push({name:"facebook toolbar wraps below the filter row", ok:fbBelow, detail:fbBelow?"wrapped":"side-by-side"});
    ok=checks.every(c=>c.ok)&&checks.length>0;
  } catch(e){ log.push("ERR:"+e.message); ok=false; }
  window.__msChecks=checks; window.__msOk=ok; window.__msDone=true;
})();