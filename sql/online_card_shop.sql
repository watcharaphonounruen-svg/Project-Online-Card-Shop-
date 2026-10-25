CREATE DATABASE IF NOT EXISTS online_card_shop
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE online_card_shop;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user','admin') NOT NULL DEFAULT 'user',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL,
  description TEXT,
  image_url VARCHAR(500),
  price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status VARCHAR(60) NOT NULL DEFAULT 'รอชำระเงิน (จำลอง)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id INT UNSIGNED NOT NULL,
  card_id INT UNSIGNED NULL,
  card_name VARCHAR(150) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_items_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL
);

INSERT INTO cards (name, category, description, image_url, price, stock) VALUES
('Pikachu - Electric Spark', 'Pokémon', 'การ์ดสะสมธีมสายฟ้า เหมาะสำหรับนักสะสม', 'https://images.unsplash.com/photo-1612036782180-6f0b6cd846fe?auto=format&fit=crop&w=900&q=85', 250.00, 12),
('Dragon Shield - Blue Dragon', 'Yu-Gi-Oh!', 'การ์ดมังกรโทนสีน้ำเงินสำหรับสะสม', 'https://images.unsplash.com/photo-1606503153255-59d8b8b5c4f2?auto=format&fit=crop&w=900&q=85', 390.00, 7),
('Mystic Forest', 'Yu-Gi-Oh!', 'การ์ดภาพป่าลึกลับสำหรับผู้ชื่นชอบงานแฟนตาซี', 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=900&q=85', 180.00, 15),
('Galaxy Warrior', 'Cardfight Vanguard', 'การ์ดนักรบแห่งกาแล็กซี รุ่นสะสม', 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=85', 320.00, 5),
('Golden Legend', 'Pokémon', 'การ์ดรุ่นพิเศษสำหรับเพิ่มสีสันให้คอลเลกชัน', 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85', 450.00, 3),
('Ocean Spirit', 'Yu-Gi-Oh!', 'การ์ดธีมทะเลและสิ่งมีชีวิตในตำนาน', 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=900&q=85', 210.00, 9);
