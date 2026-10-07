/* The client portal's look: client-portal-mockup/client-portal-home.html,
   the approved design, carried over class for class so the build and the
   mockup can be compared side by side. Text on the orange button is on
   #CC4A0A (4.6:1), as on the proposal and onboarding pages; the brand orange
   stays as glow and accent, where it carries no text. */
export const PORTAL_CSS = `
:root{--ink:#0B1633;--mute:#56637F;--line:#DCE5F4;--blue:#1F6FEB;--elec:#2E9BFF;--ice:#38BDF8;--navy:#061431;--hot:#FB6926;--hotx:#CC4A0A;--ok:#1f8a55}
*{box-sizing:border-box}
body{margin:0;font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:var(--ink);background:radial-gradient(60% 40% at 100% 0%,rgba(56,189,248,.16),transparent 60%),linear-gradient(180deg,#F7FAFF,#EEF4FF);min-height:100vh}
h1,h2,h3,h4,.sg{font-family:"Space Grotesk",Inter,sans-serif;letter-spacing:-.02em;margin:0}
.pt-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 34px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.8);backdrop-filter:blur(6px)}
.pt-brand{font:700 20px "Space Grotesk",sans-serif;color:var(--navy)}
.pt-brand em{font-style:normal;color:var(--hotx)}
.pt-top .r{display:flex;gap:14px;align-items:center;font-size:13px;color:var(--mute)}
.pt-me{padding:8px 14px;border:1px solid var(--line);border-radius:10px;background:#fff;font:600 13px Inter,sans-serif;color:var(--ink);cursor:pointer}
.pt-tabs{display:flex;gap:4px;padding:0 34px;border-bottom:1px solid var(--line);background:rgba(255,255,255,.7)}
.pt-tabs button{padding:13px 14px;font:600 14px Inter,sans-serif;color:var(--mute);border:0;border-bottom:2px solid transparent;background:none;cursor:pointer}
.pt-tabs button.on{color:var(--ink);border-bottom-color:var(--hot)}
.pt-wrap{max-width:1180px;margin:0 auto;padding:28px 34px 60px}
.kick{display:inline-flex;align-items:center;gap:8px;font:700 10.5px ui-monospace,Menlo,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--blue)}
.kick:before{content:"";width:22px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--elec),var(--hot))}
.hero{display:grid;grid-template-columns:1.5fr 1fr;gap:22px;align-items:stretch;margin-bottom:22px}
.welcome{position:relative;overflow:hidden;border-radius:22px;padding:28px 30px;border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--elec),var(--ice) 45%,var(--hot)) border-box;box-shadow:0 24px 60px -34px rgba(6,20,49,.5)}
.welcome h1{font-size:34px;line-height:1.08;margin:10px 0 8px}
.welcome h1 em{font-style:normal;color:var(--hotx)}
.welcome p{color:var(--mute);font-size:15px;max-width:560px;margin:0}
.stages{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin:18px 0 4px}
.stg{border-radius:12px;padding:10px 12px;border:1px solid var(--line);background:#fff;font-size:12px;color:var(--mute)}
.stg b{display:block;font:700 14px "Space Grotesk",sans-serif;color:var(--ink);margin-bottom:2px}
.stg.done{background:#E9F7F0;border-color:#BDE7CF}.stg.done b{color:var(--ok)}
.stg.now{background:#FFF4ED;border-color:rgba(251,105,38,.6);box-shadow:0 10px 24px -16px rgba(251,105,38,.7)}.stg.now b{color:#B23F07}
.big{display:flex;align-items:center;gap:20px;margin-top:18px}
.dring{width:110px;height:110px;border-radius:50%;display:grid;place-items:center;flex:0 0 auto}
.dring b{width:88px;height:88px;border-radius:50%;background:#fff;display:grid;place-items:center;text-align:center;font:700 26px "Space Grotesk",sans-serif;line-height:1}
.dring b small{display:block;font:600 11px Inter,sans-serif;color:var(--mute);margin-top:2px}
.big .t b{display:block;font:700 19px "Space Grotesk",sans-serif}
.big .t span{color:var(--mute);font-size:13.5px}
.ticket{position:relative;border-radius:22px;background:linear-gradient(160deg,#0A2257,#061431 75%);color:#fff;padding:22px 24px;overflow:hidden;box-shadow:0 24px 60px -30px rgba(6,20,49,.8)}
.ticket:after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,var(--elec),var(--ice) 60%,var(--hot))}
.ticket .adm{font:700 11px ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#7DD3FC}
.ticket h2{font-size:26px;margin:8px 0 4px}
.ticket .sub{color:#B9CBE6;font-size:13px}
.ticket .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:18px;border-top:1px dashed rgba(125,211,252,.35);padding-top:14px}
.ticket .row span{display:block;font:700 9.5px ui-monospace,Menlo,monospace;letter-spacing:.14em;color:#7DD3FC;text-transform:uppercase}
.ticket .row b{font:700 15px "Space Grotesk",sans-serif}
.ticket .row b.o{color:#FFB38A}
.cols{display:grid;grid-template-columns:1.5fr 1fr;gap:22px}
.card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:18px;margin-bottom:16px}
.h3{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin:2px 0 12px}
.h3 h3{font-size:19px}
.h3 span{color:var(--mute);font-size:13px}
.tl ul,.need ul{padding:0;margin:0}
.tl li,.need li{list-style:none;display:grid;grid-template-columns:22px 1fr auto;gap:10px;align-items:center;padding:9px 0;border-top:1px solid #EEF2F8;font-size:13.5px}
.tl li:first-child,.need li:first-child{border-top:0}
.tl li i{width:18px;height:18px;border-radius:50%;border:2px solid #C9D3E6;display:block}
.tl li.ok i{background:var(--ok);border-color:var(--ok)}.tl li.ok span{color:var(--mute)}
.tl li.nx i{border-color:var(--hot);box-shadow:0 0 0 3px rgba(251,105,38,.18)}.tl li.nx span{font-weight:700}
.tl em,.need em{font-style:normal;font-size:12px;color:var(--mute)}
.need i{width:20px;height:20px;border-radius:6px;border:1.6px solid #C9D3E6;display:block}
.allclear{color:var(--ok);font-weight:700}
.bill .r{display:flex;justify-content:space-between;gap:10px;font-size:13.5px;padding:7px 0;border-top:1px solid #EEF2F8}.bill .r:first-of-type{border-top:0}
.paid{color:var(--ok);font-weight:700}
.crew{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.mem{border:1px solid var(--line);border-radius:14px;padding:12px;text-align:center;background:linear-gradient(180deg,#F7FAFF,#fff)}
.mem img,.mem .ini{width:62px;height:62px;border-radius:50%;object-fit:cover;border:3px solid #fff;box-shadow:0 0 0 2px var(--elec);display:inline-grid;place-items:center;font:700 22px "Space Grotesk",sans-serif;color:var(--navy);background:#EAF2FF}
.mem b{display:block;font:700 14px "Space Grotesk",sans-serif;margin-top:6px}
.mem span{font-size:11.5px;color:var(--mute)}
.mem .act{display:flex;justify-content:center;gap:8px;margin-top:8px;font-size:12.5px}
.mem .act a{color:var(--blue);font-weight:600;text-decoration:none}
.docs .pick{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.docs .pick button{padding:8px 12px;border-radius:99px;border:1px solid var(--line);font:600 12.5px Inter,sans-serif;background:#fff;cursor:pointer}
.docs .pick button.on{background:var(--navy);color:#fff;border-color:var(--navy)}
.terms{font-size:13.5px;color:var(--mute);margin:0}
.terms a{color:var(--blue);font-weight:600}
.ans{display:grid;grid-template-columns:minmax(140px,1fr) 2fr;gap:6px 14px;font-size:13.5px}
.ans dt{color:var(--mute)}.ans dd{margin:0;word-break:break-word}
.ans h4{grid-column:1/-1;font-size:15px;margin:12px 0 2px}
.signin{max-width:440px;margin:70px auto;border-radius:22px;padding:30px;border:1.5px solid transparent;background:linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,var(--elec),var(--ice) 45%,var(--hot)) border-box;box-shadow:0 24px 60px -34px rgba(6,20,49,.5)}
.signin h1{font-size:28px;margin:10px 0 8px}
.signin p{color:var(--mute);font-size:14.5px;margin:0 0 16px}
.signin input{width:100%;font:inherit;font-size:16px;border:1px solid #C9CDE3;border-radius:12px;padding:13px 14px;margin-bottom:12px}
.btn{font:700 15px Inter,sans-serif;color:#fff;background:var(--hotx);border:0;border-radius:12px;padding:14px 20px;cursor:pointer;width:100%;box-shadow:0 12px 26px -10px rgba(251,105,38,.7)}
.btn:disabled{opacity:.55;cursor:default}
.ok-msg{background:#E9F7F0;color:#14663E;border-radius:12px;padding:12px 14px;font-size:14px}
.err-msg{background:#FDECEC;color:#9B2C2C;border-radius:12px;padding:12px 14px;font-size:14px;margin-bottom:12px}
.empty{max-width:560px;margin:60px auto;text-align:center;color:var(--mute)}
@media (max-width:700px){
 .pt-top{padding:12px 16px}.pt-top .r .hide{display:none}.pt-wrap{padding:16px 14px 40px}.pt-tabs{padding:0 10px;overflow-x:auto}
 .hero,.cols{grid-template-columns:1fr}.welcome{padding:22px 18px}.welcome h1{font-size:27px}
 .stages{grid-template-columns:repeat(5,minmax(92px,1fr));overflow-x:auto}.big{flex-wrap:wrap}.ans{grid-template-columns:1fr}
}
`;
