const {app,BrowserWindow,ipcMain,shell}=require("electron");
const path=require("path"),fs=require("fs"),crypto=require("crypto");
const {TronWeb}=require("tronweb");
const HOST="https://api.trongrid.io";
const USDT="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
let pk=null;
let multiVault=null, vaultPassword=null;
const tw=()=>new TronWeb({fullHost:HOST});
const vp=()=>path.join(app.getPath("userData"),"wallet.vault");

function norm(x){
  x=String(x||"").trim().replace(/^0x/i,"");
  if(!/^[0-9a-fA-F]{64}$/.test(x)) throw Error("Private key: нужны 64 hex-символа.");
  return x;
}
function key(p,s){return crypto.scryptSync(p,s,32,{N:16384,r:8,p:1})}
function enc(x,p){
  const s=crypto.randomBytes(16),iv=crypto.randomBytes(12);
  const c=crypto.createCipheriv("aes-256-gcm",key(p,s),iv);
  const ct=Buffer.concat([c.update(x,"utf8"),c.final()]);
  return {s:s.toString("base64"),i:iv.toString("base64"),
          t:c.getAuthTag().toString("base64"),c:ct.toString("base64")};
}
function dec(v,p){
  const d=crypto.createDecipheriv("aes-256-gcm",
    key(p,Buffer.from(v.s,"base64")),Buffer.from(v.i,"base64"));
  d.setAuthTag(Buffer.from(v.t,"base64"));
  return Buffer.concat([d.update(Buffer.from(v.c,"base64")),d.final()]).toString();
}
function addr(){
  if(!pk) throw Error("Кошелёк заблокирован.");
  return tw().address.fromPrivateKey(pk);
}
function valid(a){if(!tw().isAddress(a))throw Error("Некорректный TRON-адрес.")}
function units(x,d=6){
  x=String(x).trim();
  if(!/^\d+(\.\d+)?$/.test(x))throw Error("Некорректная сумма.");
  const [a,b=""]=x.split(".");
  if(b.length>d)throw Error("Максимум 6 знаков после запятой.");
  const n=BigInt(a)*10n**BigInt(d)+BigInt((b+"0".repeat(d)).slice(0,d));
  if(n<=0n)throw Error("Сумма должна быть > 0.");
  return n;
}
function decodeNodeMessage(v){
  if(!v) return "";
  try {
    if(typeof v==="string" && /^[0-9a-fA-F]+$/.test(v) && v.length%2===0)
      return Buffer.from(v,"hex").toString("utf8");
  } catch {}
  return String(v);
}
function broadcastError(r){
  const code=r?.code||r?.result?.code||"BROADCAST_ERROR";
  const message=decodeNodeMessage(r?.message||r?.result?.message);
  return `${code}${message?": "+message:""}`;
}
function constantError(r){
  const code=r?.result?.code||"CONSTANT_CONTRACT_ERROR";
  const message=decodeNodeMessage(r?.result?.message);
  return `${code}${message?": "+message:""}`;
}

ipcMain.handle("exists",()=>fs.existsSync(vp()));
ipcMain.handle("create",(_,x,p,name)=>{
  if(!p||p.length<10)throw Error("Пароль минимум 10 символов.");
  pk=norm(x); const a=addr(), id=crypto.randomUUID(); vaultPassword=p;
  multiVault={version:2,activeWalletId:id,wallets:[{id,name:String(name||"Основной").trim()||"Основной",address:a,key:enc(pk,p)}]};
  fs.writeFileSync(vp(),JSON.stringify(enc(JSON.stringify(multiVault),p))); return pub();
});
function pub(){return {activeWalletId:multiVault.activeWalletId,wallets:multiVault.wallets.map(w=>({id:w.id,name:w.name,address:w.address}))};}
function activeWallet(){const w=multiVault?.wallets.find(x=>x.id===multiVault.activeWalletId);if(!w)throw Error("Активный кошелёк не найден.");return w;}
function saveMulti(){fs.writeFileSync(vp(),JSON.stringify(enc(JSON.stringify(multiVault),vaultPassword)));}
function useActive(){const w=activeWallet();pk=norm(dec(w.key,vaultPassword));return w;}
ipcMain.handle("unlock",(_,p)=>{
  try{
    const outer=JSON.parse(fs.readFileSync(vp(),"utf8")); const plain=dec(outer,p); vaultPassword=p;
    if(/^[0-9a-fA-F]{64}$/.test(plain)){
      pk=norm(plain); const a=addr(),id=crypto.randomUUID();
      multiVault={version:2,activeWalletId:id,wallets:[{id,name:"Основной",address:a,key:enc(pk,p)}]}; saveMulti();
    } else { multiVault=JSON.parse(plain); if(multiVault.version!==2||!Array.isArray(multiVault.wallets))throw Error(); useActive(); }
    return pub();
  }catch{pk=null;multiVault=null;vaultPassword=null;throw Error("Неверный пароль или повреждён vault.");}
});
ipcMain.handle("lock",()=>{pk=null;multiVault=null;vaultPassword=null;return true});
ipcMain.handle("list",()=>pub());
ipcMain.handle("add",(_,x,name)=>{x=norm(x);const a=tw().address.fromPrivateKey(x);if(multiVault.wallets.some(w=>w.address===a))throw Error("Этот кошелёк уже добавлен.");const id=crypto.randomUUID();multiVault.wallets.push({id,name:String(name||`Wallet ${multiVault.wallets.length+1}`).trim(),address:a,key:enc(x,vaultPassword)});multiVault.activeWalletId=id;saveMulti();useActive();return pub();});
ipcMain.handle("select",(_,id)=>{if(!multiVault.wallets.some(w=>w.id===id))throw Error("Кошелёк не найден.");multiVault.activeWalletId=id;saveMulti();useActive();return pub();});
ipcMain.handle("rename",(_,id,name)=>{const w=multiVault.wallets.find(x=>x.id===id);name=String(name||"").trim();if(!w||!name)throw Error("Некорректное имя.");w.name=name;saveMulti();return pub();});
ipcMain.handle("remove",(_,id)=>{if(multiVault.wallets.length<=1)throw Error("Нельзя удалить единственный кошелёк.");multiVault.wallets=multiVault.wallets.filter(w=>w.id!==id);if(multiVault.activeWalletId===id)multiVault.activeWalletId=multiVault.wallets[0].id;saveMulti();useActive();return pub();});
ipcMain.handle("info",async()=>{
  const t=tw(),w=useActive(),a=w.address; const trxSun=await t.trx.getBalance(a);
  const r=await t.transactionBuilder.triggerConstantContract(USDT,"balanceOf(address)",{},[{type:"address",value:a}],a);
  if(!r?.result?.result)throw Error("USDT balance: "+constantError(r));
  const u=r.constant_result?.[0]?BigInt("0x"+r.constant_result[0]):0n;
  const rs=await t.trx.getAccountResources(a); const fl=Number(rs.freeNetLimit||0),fu=Number(rs.freeNetUsed||0),nl=Number(rs.NetLimit||0),nu=Number(rs.NetUsed||0),el=Number(rs.EnergyLimit||0),eu=Number(rs.EnergyUsed||0);
  return {name:w.name,address:a,trx:(Number(trxSun)/1e6).toFixed(6),usdt:`${u/1000000n}.${(u%1000000n).toString().padStart(6,"0")}`,energyAvailable:Math.max(0,el-eu),energyLimit:el,bandwidthAvailable:Math.max(0,fl-fu)+Math.max(0,nl-nu),bandwidthLimit:fl+nl};
});
ipcMain.handle("trx",async(_,to,amount)=>{valid(to);const n=units(amount);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error("Сумма слишком велика.");const t=tw(),w=useActive(),balance=BigInt(await t.trx.getBalance(w.address));if(balance<n)throw Error(`Недостаточно TRX. Баланс ${(Number(balance)/1e6).toFixed(6)} TRX.`);const tx=await t.transactionBuilder.sendTrx(to,Number(n),w.address),s=await t.trx.sign(tx,pk),r=await t.trx.sendRawTransaction(s);if(!r?.result)throw Error(broadcastError(r));return r.txid||s.txID;});
ipcMain.handle("usdt",async(_,to,amount)=>{valid(to);const t=tw(),w=useActive(),n=units(amount);const b=await t.transactionBuilder.triggerSmartContract(USDT,"transfer(address,uint256)",{feeLimit:100000000},[{type:"address",value:to},{type:"uint256",value:n.toString()}],w.address);if(!b?.result?.result||!b?.transaction)throw Error("Создание USDT-транзакции: "+constantError(b));const s=await t.trx.sign(b.transaction,pk),r=await t.trx.sendRawTransaction(s);if(!r?.result)throw Error(broadcastError(r));return r.txid||s.txID;});
ipcMain.handle("open",(_,id)=>
  shell.openExternal("https://tronscan.org/#/transaction/"+encodeURIComponent(id)));

function win(){
  const w=new BrowserWindow({
    width:900,height:700,
    webPreferences:{
      preload:path.join(__dirname,"preload.js"),
      contextIsolation:true,nodeIntegration:false,sandbox:true
    }
  });
  w.removeMenu();
  w.loadFile(path.join(__dirname,"index.html"));
}
app.whenReady().then(win);
app.on("window-all-closed",()=>{pk=null;if(process.platform!=="darwin")app.quit()});
