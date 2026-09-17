const {app,BrowserWindow,ipcMain,shell}=require("electron");
const path=require("path"),fs=require("fs"),crypto=require("crypto");
const {TronWeb}=require("tronweb");
const HOST="https://api.trongrid.io",USDT="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"; let pk=null;
const tw=()=>new TronWeb({fullHost:HOST});
const vp=()=>path.join(app.getPath("userData"),"wallet.vault");
function norm(x){x=String(x||"").trim().replace(/^0x/i,"");if(!/^[0-9a-fA-F]{64}$/.test(x))throw Error("Private key: нужны 64 hex-символа.");return x}
function key(p,s){return crypto.scryptSync(p,s,32,{N:16384,r:8,p:1})}
function enc(x,p){let s=crypto.randomBytes(16),iv=crypto.randomBytes(12),c=crypto.createCipheriv("aes-256-gcm",key(p,s),iv),ct=Buffer.concat([c.update(x,"utf8"),c.final()]);return{s:s.toString("base64"),i:iv.toString("base64"),t:c.getAuthTag().toString("base64"),c:ct.toString("base64")}}
function dec(v,p){let d=crypto.createDecipheriv("aes-256-gcm",key(p,Buffer.from(v.s,"base64")),Buffer.from(v.i,"base64"));d.setAuthTag(Buffer.from(v.t,"base64"));return Buffer.concat([d.update(Buffer.from(v.c,"base64")),d.final()]).toString()}
function addr(){if(!pk)throw Error("Кошелёк заблокирован.");return tw().address.fromPrivateKey(pk)}
function valid(a){if(!tw().isAddress(a))throw Error("Некорректный TRON-адрес.")}
function units(x,d=6){x=String(x).trim();if(!/^\d+(\.\d+)?$/.test(x))throw Error("Некорректная сумма.");let[a,b=""]=x.split(".");if(b.length>d)throw Error("Максимум 6 знаков после запятой.");let n=BigInt(a)*10n**BigInt(d)+BigInt((b+"0".repeat(d)).slice(0,d));if(n<=0n)throw Error("Сумма должна быть > 0.");return n}
ipcMain.handle("exists",()=>fs.existsSync(vp()));
ipcMain.handle("import",(_,x,p)=>{if(!p||p.length<10)throw Error("Пароль минимум 10 символов.");pk=norm(x);let a=addr();fs.writeFileSync(vp(),JSON.stringify(enc(pk,p)));return a});
ipcMain.handle("unlock",(_,p)=>{try{pk=norm(dec(JSON.parse(fs.readFileSync(vp(),"utf8")),p));return addr()}catch{throw Error("Неверный пароль или повреждён vault.")}});
ipcMain.handle("lock",()=>{pk=null});
ipcMain.handle("info",async()=>{let t=tw(),a=addr(),trx=await t.trx.getBalance(a),c=await t.contract().at(USDT),u=BigInt((await c.balanceOf(a).call()).toString());return{address:a,trx:(Number(trx)/1e6).toFixed(6),usdt:`${u/1000000n}.${(u%1000000n).toString().padStart(6,"0")}`}});
ipcMain.handle("trx",async(_,to,amount)=>{valid(to);let n=units(amount);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Сумма слишком велика.");let t=tw(),tx=await t.transactionBuilder.sendTrx(to,Number(n),addr()),s=await t.trx.sign(tx,pk),r=await t.trx.sendRawTransaction(s);if(!r.result)throw Error("Сеть отклонила транзакцию.");return r.txid||s.txID});
ipcMain.handle("usdt",async(_,to,amount)=>{valid(to);let t=tw(),n=units(amount),b=await t.transactionBuilder.triggerSmartContract(USDT,"transfer(address,uint256)",{feeLimit:100000000},[{type:"address",value:to},{type:"uint256",value:n.toString()}],addr());if(!b.result?.result||!b.transaction)throw Error("Не удалось создать USDT-транзакцию.");let s=await t.trx.sign(b.transaction,pk),r=await t.trx.sendRawTransaction(s);if(!r.result)throw Error("Сеть отклонила транзакцию.");return r.txid||s.txID});
ipcMain.handle("open",(_,id)=>shell.openExternal("https://tronscan.org/#/transaction/"+encodeURIComponent(id)));
function win(){let w=new BrowserWindow({width:900,height:700,webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,nodeIntegration:false,sandbox:true}});w.removeMenu();w.loadFile(path.join(__dirname,"index.html"))}
app.whenReady().then(win);app.on("window-all-closed",()=>{pk=null;if(process.platform!=="darwin")app.quit()});