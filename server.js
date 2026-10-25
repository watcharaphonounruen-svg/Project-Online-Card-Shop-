require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const CARD_CATEGORIES = ['Pokémon', 'Cardfight Vanguard', 'Yu-Gi-Oh!'];
const PORT = Number(process.env.PORT) || 3000;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'online_card_shop',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: '8mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionStore = new MySQLStore({}, pool);
app.use(session({
  key: 'cardshop.sid',
  secret: process.env.SESSION_SECRET || 'development-secret-change-before-submission',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 1000 * 60 * 60 * 4
  }
}));

function apiLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ message: 'กรุณาเข้าสู่ระบบก่อน' });
  next();
}
function apiAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ message: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  next();
}
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null, cartCount: Object.values(req.session.cart || {}).reduce((a,b)=>a+Number(b),0) }));
app.get('/api/cards', async (req,res,next) => {
  try {
    const search=String(req.query.search||'').trim(), category=String(req.query.category||'').trim();
    let sql='SELECT id,name,category,description,image_url,price,stock FROM cards WHERE is_active=1'; const args=[];
    if(search){sql+=' AND (name LIKE ? OR description LIKE ?)';args.push('%'+search+'%','%'+search+'%');}
    if(category){sql+=' AND category=?';args.push(category);}
    sql+=' ORDER BY created_at DESC,id DESC'; const [cards]=await pool.execute(sql,args);
    const [cats]=await pool.query('SELECT DISTINCT category FROM cards WHERE is_active=1 ORDER BY category');
    res.json({cards,categories:cats.map(x=>x.category)});
  } catch(e){next(e)}
});
app.post('/api/register', async(req,res,next)=>{try{
 const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
 if(name.length<2||!email.includes('@')||password.length<6)return res.status(400).json({message:'กรอกชื่อ อีเมลให้ถูกต้อง และรหัสผ่านอย่างน้อย 6 ตัวอักษร'});
 const [old]=await pool.execute('SELECT id FROM users WHERE email=?',[email]); if(old.length)return res.status(409).json({message:'อีเมลนี้สมัครสมาชิกแล้ว'});
 const hash=await bcrypt.hash(password,10); const [r]=await pool.execute('INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',[name,email,hash,'user']);
 req.session.regenerate(err=>{if(err)return next(err);req.session.user={id:r.insertId,name,email,role:'user'};req.session.cart={};req.session.save(e=>e?next(e):res.json({user:req.session.user,message:'สมัครสมาชิกสำเร็จ'}));});
}catch(e){next(e)}});
app.post('/api/login',async(req,res,next)=>{try{
 const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');const [rows]=await pool.execute('SELECT * FROM users WHERE email=?',[email]);
 if(!rows.length||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({message:'อีเมลหรือรหัสผ่านไม่ถูกต้อง'});
 const u=rows[0];req.session.regenerate(err=>{if(err)return next(err);req.session.user={id:u.id,name:u.name,email:u.email,role:u.role};req.session.cart={};req.session.save(e=>e?next(e):res.json({user:req.session.user,message:'เข้าสู่ระบบสำเร็จ'}));});
}catch(e){next(e)}});
app.post('/api/logout',(req,res)=>req.session.destroy(err=>{if(err)return res.status(500).json({message:'ออกจากระบบไม่สำเร็จ'});res.clearCookie('cardshop.sid');res.json({message:'ออกจากระบบแล้ว'});}));
app.get('/api/cart',async(req,res,next)=>{try{const cart=req.session.cart||{},ids=Object.keys(cart);if(!ids.length)return res.json({items:[],total:0});const [rows]=await pool.query(`SELECT * FROM cards WHERE id IN (${ids.map(()=>'?').join(',')}) AND is_active=1`,ids);const items=rows.map(c=>({...c,quantity:Math.min(Number(cart[c.id]||0),c.stock)}));res.json({items,total:items.reduce((s,x)=>s+Number(x.price)*x.quantity,0)});}catch(e){next(e)}});
app.post('/api/cart/:id',async(req,res,next)=>{try{const id=String(req.params.id),qty=Math.max(0,Math.floor(Number(req.body.quantity)||0));const [r]=await pool.execute('SELECT id,stock FROM cards WHERE id=? AND is_active=1',[id]);if(!r.length)return res.status(404).json({message:'ไม่พบสินค้า'});req.session.cart=req.session.cart||{};if(qty===0)delete req.session.cart[id];else if(qty>r[0].stock)return res.status(400).json({message:'จำนวนเกินสินค้าในสต็อก'});else req.session.cart[id]=qty;res.json({message:'อัปเดตตะกร้าแล้ว',cartCount:Object.values(req.session.cart).reduce((a,b)=>a+b,0)});}catch(e){next(e)}});
app.post('/api/checkout',apiLogin,async(req,res,next)=>{const conn=await pool.getConnection();try{const cart=req.session.cart||{},ids=Object.keys(cart);if(!ids.length)return res.status(400).json({message:'ตะกร้าสินค้าว่าง'});await conn.beginTransaction();let total=0;const items=[];for(const id of ids){const [rr]=await conn.execute('SELECT * FROM cards WHERE id=? AND is_active=1 FOR UPDATE',[id]);if(!rr.length)throw Error('ไม่พบสินค้า');const c=rr[0],q=Number(cart[id]);if(q<1||q>c.stock)throw Error('สินค้า '+c.name+' มีไม่เพียงพอ');total+=Number(c.price)*q;items.push({c,q});}const paymentMethod = String(req.body.payment_method || '');
const paymentStatus = paymentMethod === 'demo_qr' ? 'ชำระเงินแล้ว' : 'รอชำระเงิน';
const [o]=await conn.execute('INSERT INTO orders(user_id,total_amount,status) VALUES(?,?,?)',[req.session.user.id,total,paymentStatus]);for(const it of items){await conn.execute('INSERT INTO order_items(order_id,card_id,card_name,price,quantity) VALUES(?,?,?,?,?)',[o.insertId,it.c.id,it.c.name,it.c.price,it.q]);await conn.execute('UPDATE cards SET stock=stock-? WHERE id=?',[it.q,it.c.id]);}await conn.commit();req.session.cart={};res.json({message:'สั่งซื้อสำเร็จ เลขที่ #'+o.insertId});}catch(e){await conn.rollback();res.status(400).json({message:e.message||'สั่งซื้อไม่สำเร็จ'});}finally{conn.release()}});
app.get('/api/orders',apiLogin,async(req,res,next)=>{try{const [orders]=await pool.execute('SELECT * FROM orders WHERE user_id=? ORDER BY created_at DESC',[req.session.user.id]);for(const o of orders){const [items]=await pool.execute('SELECT card_name,price,quantity FROM order_items WHERE order_id=?',[o.id]);o.items=items;}res.json({orders});}catch(e){next(e)}});
app.get('/api/admin/summary',apiAdmin,async(req,res,next)=>{try{const [[users]]=await pool.query('SELECT COUNT(*) count FROM users');const [[cards]]=await pool.query('SELECT COUNT(*) count FROM cards');const [[orders]]=await pool.query('SELECT COUNT(*) count FROM orders');const [allCards]=await pool.query('SELECT * FROM cards ORDER BY id DESC');const [allOrders]=await pool.query('SELECT o.*,u.name customer_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 30');res.json({usersCount:users.count,cardsCount:cards.count,ordersCount:orders.count,cards:allCards,orders:allOrders});}catch(e){next(e)}});
function getImageHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function findExistingImage(dir, hash) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of files) {
    if (!entry.isFile()) continue;
    const filePath = path.join(dir, entry.name);
    try {
      const fileBuffer = fs.readFileSync(filePath);
      if (getImageHash(fileBuffer) === hash) return entry.name;
    } catch (_) {}
  }
  return null;
}

function saveUploadedImage(imageData, category) {
  if (!imageData) return '';
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(imageData));
  if (!match) throw Object.assign(new Error('ไฟล์รูปต้องเป็น JPG, PNG, WEBP หรือ GIF'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw Object.assign(new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB'), { status: 400 });
  const ext = { jpeg: '.jpg', png: '.png', webp: '.webp', gif: '.gif' }[match[1]];
  const folder = ({ 'Pokémon': 'pokemon', 'Cardfight Vanguard': 'vanguard', 'Yu-Gi-Oh!': 'yugioh' })[category];
  if (!folder) throw Object.assign(new Error('ประเภทการ์ดไม่ถูกต้อง'), { status: 400 });
  const dir = path.join(__dirname, 'public', 'images', folder);
  fs.mkdirSync(dir, { recursive: true });


  const hash = getImageHash(buffer);
  const existing = findExistingImage(dir, hash);
  if (existing) return `/images/${folder}/${encodeURIComponent(existing)}`;


  const filename = `card-${hash.slice(0, 20)}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer, { flag: 'wx' });
  return `/images/${folder}/${filename}`;
}

async function removeUnusedLocalImage(imageUrl) {
  if (!imageUrl || !imageUrl.startsWith('/images/')) return;
  const normalized = imageUrl.split('?')[0];
  const relative = decodeURIComponent(normalized.replace(/^\/images\//, ''));
  const filePath = path.join(__dirname, 'public', 'images', relative);
  const root = path.join(__dirname, 'public', 'images');
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) return;
  try { await fs.promises.unlink(resolved); } catch (_) {}
}

async function cleanupDuplicateLocalImages() {
  const imageRoot = path.join(__dirname, 'public', 'images');
  const folders = ['pokemon', 'vanguard', 'yugioh'];
  for (const folder of folders) {
    const dir = path.join(imageRoot, folder);
    if (!fs.existsSync(dir)) continue;
    const seen = new Map();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(png|jpe?g|webp|gif)$/i.test(entry.name)) continue;
      const filePath = path.join(dir, entry.name);
      let hash;
      try { hash = getImageHash(fs.readFileSync(filePath)); } catch (_) { continue; }
      if (!seen.has(hash)) {
        seen.set(hash, entry.name);
        continue;
      }
      const duplicateUrl = `/images/${folder}/${encodeURIComponent(entry.name)}`;
      const canonicalUrl = `/images/${folder}/${encodeURIComponent(seen.get(hash))}`;
      await pool.execute('UPDATE cards SET image_url=? WHERE image_url=?', [canonicalUrl, duplicateUrl]);
      try { await fs.promises.unlink(filePath); } catch (_) {}
    }
  }
}

app.post('/api/admin/cards',apiAdmin,async(req,res,next)=>{try{const b=req.body;if(!String(b.name||'').trim()||!CARD_CATEGORIES.includes(String(b.category||''))||!Number.isFinite(Number(b.price))||Number(b.price)<0||!Number.isInteger(Number(b.stock))||Number(b.stock)<0)return res.status(400).json({message:'กรอกชื่อ ประเภท ราคา และจำนวนสินค้าให้ถูกต้อง'});const imageUrl=b.image_data?saveUploadedImage(b.image_data,b.category):String(b.image_url||'').trim();await pool.execute('INSERT INTO cards(name,category,description,image_url,price,stock,is_active) VALUES(?,?,?,?,?,?,1)',[String(b.name).trim(),b.category,b.description||'',imageUrl,Number(b.price),Math.floor(Number(b.stock))]);res.json({message:'เพิ่มสินค้าและบันทึกรูปภาพแล้ว'});}catch(e){next(e)}});
app.patch('/api/admin/cards/:id',apiAdmin,async(req,res,next)=>{try{const b=req.body;if(b.is_active!==undefined)await pool.execute('UPDATE cards SET is_active=? WHERE id=?',[b.is_active?1:0,req.params.id]);else {if(!String(b.name||'').trim()||!CARD_CATEGORIES.includes(String(b.category||''))||!Number.isFinite(Number(b.price))||Number(b.price)<0||!Number.isInteger(Number(b.stock))||Number(b.stock)<0)return res.status(400).json({message:'กรอกชื่อ ประเภท ราคา และจำนวนสินค้าให้ถูกต้อง'});const [oldRows]=await pool.execute('SELECT image_url FROM cards WHERE id=?',[req.params.id]);const oldImage=oldRows[0]?.image_url||'';const imageUrl=b.image_data?saveUploadedImage(b.image_data,b.category):String(b.image_url||'').trim();await pool.execute('UPDATE cards SET name=?,category=?,description=?,image_url=?,price=?,stock=? WHERE id=?',[String(b.name).trim(),b.category,b.description||'',imageUrl,Number(b.price),Number(b.stock),req.params.id]);if(b.image_data && oldImage && oldImage!==imageUrl){const [[used]] = await pool.execute('SELECT COUNT(*) count FROM cards WHERE image_url=?',[oldImage]);if(Number(used.count)===0) await removeUnusedLocalImage(oldImage);}}res.json({message:'บันทึกสินค้าแล้ว'});}catch(e){next(e)}});
app.delete('/api/admin/cards/:id',apiAdmin,async(req,res,next)=>{try{const id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({message:'รหัสสินค้าไม่ถูกต้อง'});const [rows]=await pool.execute('SELECT image_url,name FROM cards WHERE id=?',[id]);if(!rows.length)return res.status(404).json({message:'ไม่พบสินค้า'});const imageUrl=rows[0].image_url||'';await pool.execute('DELETE FROM cards WHERE id=?',[id]);if(imageUrl){const [[used]] = await pool.execute('SELECT COUNT(*) count FROM cards WHERE image_url=?',[imageUrl]);if(Number(used.count)===0) await removeUnusedLocalImage(imageUrl);}res.json({message:`ลบสินค้า ${rows[0].name} เรียบร้อยแล้ว`});}catch(e){next(e)}});
app.patch('/api/admin/orders/:id',apiAdmin,async(req,res,next)=>{try{const statusMap={'รอชำระเงิน (จำลอง)':'รอชำระเงิน','ชำระเงินแล้ว (จำลอง)':'ชำระเงินแล้ว','ชำระเงินแล้ว (QR จำลอง)':'ชำระเงินแล้ว'};const status=statusMap[req.body.status]||req.body.status;const allowed=['รอชำระเงิน','ชำระเงินแล้ว','กำลังจัดส่ง','สำเร็จ','ยกเลิก'];if(!allowed.includes(status))return res.status(400).json({message:'สถานะไม่ถูกต้อง'});await pool.execute('UPDATE orders SET status=? WHERE id=?',[status,req.params.id]);res.json({message:'อัปเดตสถานะแล้ว'});}catch(e){next(e)}});
app.get('/api/admin/users',apiAdmin,async(req,res,next)=>{try{const [users]=await pool.query('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC');res.json({users});}catch(e){next(e)}});
app.patch('/api/admin/users/:id',apiAdmin,async(req,res,next)=>{try{if(Number(req.params.id)===req.session.user.id)return res.status(400).json({message:'เปลี่ยนสิทธิ์บัญชีตัวเองไม่ได้'});const role=req.body.role==='admin'?'admin':'user';await pool.execute('UPDATE users SET role=? WHERE id=?',[role,req.params.id]);res.json({message:'เปลี่ยนสิทธิ์แล้ว'});}catch(e){next(e)}});

app.use((req, res) => res.status(404).json({ message: 'ไม่พบ API ที่เรียกใช้งาน' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ message: 'ระบบมีปัญหา กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลและการตั้งค่าในไฟล์ .env' });
});

async function start() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    await cleanupDuplicateLocalImages();
    conn.release();

    await pool.execute("UPDATE cards SET category = CASE WHEN category IN ('โปเกมอน','Pokemon','Pokémon') THEN 'Pokémon' WHEN category IN ('ไซไฟ','การ์ดไฟท์ แวนการ์ด','Cardfight!! Vanguard') THEN 'Cardfight Vanguard' WHEN category IN ('แฟนตาซี','รุ่นพิเศษ','Yu-Gi-Oh') THEN 'Yu-Gi-Oh!' ELSE category END WHERE category NOT IN ('Pokémon','Cardfight Vanguard','Yu-Gi-Oh!')");
    app.listen(PORT, () => console.log(`Online Card Shop เปิดที่ http://localhost:${PORT}`));
  } catch (err) {
    console.error('เชื่อมต่อ MySQL ไม่สำเร็จ');
    console.error('รายละเอียด:', err && (err.message || err.code || err));
    console.error('ค่าที่กำลังใช้:', { host: dbConfig.host, port: dbConfig.port, user: dbConfig.user, database: dbConfig.database });
    console.error('ตรวจสอบว่าได้ import ไฟล์ sql/online_card_shop.sql แล้ว และค่าใน .env ตรงกับ MySQL');
    process.exit(1);
  }
}
start();