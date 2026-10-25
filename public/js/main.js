

const $ = (selector) => document.querySelector(selector);

let currentUser = null;
let registerMode = false;
let cardsCache = [];

const CARD_CATEGORIES = [
    'Pokémon',
    'Cardfight Vanguard',
    'Yu-Gi-Oh!'
];


const money = (amount) => {
    return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: 'THB',
        maximumFractionDigits: 0
    }).format(Number(amount) || 0);
};


const esc = (value) => {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
};



async function api(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
    };

    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers
    });

    let data = {};

    try {
        data = await response.json();
    } catch {
        
    }

    if (!response.ok) {
        throw new Error(
            data.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
        );
    }

    return data;
}


function notice(message, error = false) {
    const element = $('#notice');

    if (!element) return;

    element.textContent = message || '';
    element.className = error ? 'notice-error' : '';

    const products = $('#products');

    if (products) {
        window.scrollTo({
            top: products.offsetTop - 80,
            behavior: 'smooth'
        });
    }
}



function showToast(message, type = 'success') {
    const container = $('#toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'error' ? '!' : '✓'}</span>
        <div><strong>${type === 'error' ? 'เกิดข้อผิดพลาด' : 'เรียบร้อยแล้ว'}</strong><p>${esc(message)}</p></div>
        <button type="button" aria-label="ปิด">×</button>
    `;
    toast.querySelector('button').onclick = () => toast.remove();
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 220);
    }, 3200);
}

function makeFakeQr(seed = '') {
    const size = 21;
    const cells = Array.from({length:size*size}, () => false);
    const reserved = new Set();
    const at = (r,c) => r*size+c;
    const finder = (sr,sc) => {
        for (let r=-1;r<=7;r++) for (let c=-1;c<=7;c++) {
            const rr=sr+r, cc=sc+c; if(rr>=0&&rr<size&&cc>=0&&cc<size) reserved.add(at(rr,cc));
        }
        for (let r=0;r<7;r++) for (let c=0;c<7;c++) {
            const on = r===0||r===6||c===0||c===6||(r>=2&&r<=4&&c>=2&&c<=4);
            if(on) cells[at(sr+r,sc+c)] = true;
        }
    };
    finder(0,0); finder(0,14); finder(14,0);
    let hash=2166136261;
    for(const ch of String(seed)){ hash ^= ch.charCodeAt(0); hash = Math.imul(hash,16777619); }
    for(let i=0;i<cells.length;i++){
        if(reserved.has(i)) continue;
        hash ^= hash<<13; hash ^= hash>>>17; hash ^= hash<<5;
        cells[i] = (hash & 1) === 1;
    }
    return cells.map(v=>`<i class="${v?'on':''}"></i>`).join('');
}

function openPaymentModal(total) {
    $('#paymentTotal').textContent = money(total);
    const ref = `DEMO-${Date.now().toString().slice(-8)}`;
    $('#paymentReference').textContent = ref;
    $('#fakeQr').innerHTML = makeFakeQr(ref);
    $('#paymentModal').hidden = false;
}

function updateUserUI() {
    $('#userLabel').textContent = currentUser
        ? `สวัสดี ${currentUser.name}`
        : 'ยินดีต้อนรับ';

    $('#loginOpen').hidden = Boolean(currentUser);
    $('#logoutBtn').hidden = !currentUser;

    $('#ordersLink').hidden = !currentUser;
    $('#orders').hidden = !currentUser;

    const isAdmin = currentUser?.role === 'admin';

    $('#adminLink').hidden = !isAdmin;
    $('#admin').hidden = !isAdmin;
}



async function loadCards() {
    try {
        const query = new URLSearchParams({
            search: $('#searchInput').value.trim(),
            category: $('#categoryFilter').value
        });

        const data = await api(`/api/cards?${query}`);

        cardsCache = data.cards;

        const categorySelect = $('#categoryFilter');
        const previousCategory = categorySelect.value;

        categorySelect.innerHTML = [
            '<option value="">ทุกประเภท</option>',
            ...CARD_CATEGORIES.map((category) => `
                <option value="${esc(category)}">
                    ${esc(category)}
                </option>
            `)
        ].join('');

        categorySelect.value = CARD_CATEGORIES.includes(previousCategory)
            ? previousCategory
            : '';

        const productGrid = $('#productGrid');

        if (!data.cards.length) {
            productGrid.innerHTML = `
                <div class="empty-state">
                    ยังไม่พบการ์ดที่ตรงกับการค้นหา
                </div>
            `;
            return;
        }

        productGrid.innerHTML = data.cards.map((card) => `
            <article class="product-card" data-card-id="${Number(card.id)}" tabindex="0" title="ดับเบิลคลิกเพื่อดูรายละเอียด">
                <img
                    class="product-image"
                    src="${esc(card.image_url || '')}"
                    alt="${esc(card.name)}"
                    onerror="
                        this.onerror = null;
                        this.classList.add('image-missing');
                        this.removeAttribute('src');
                        this.alt = 'ไม่มีรูปภาพสินค้า';
                    "
                >

                <div class="product-body">
                    <span class="product-category">
                        ${esc(card.category)}
                    </span>

                    <h3>${esc(card.name)}</h3>

                    <p>
                        ${esc(
                            card.description ||
                            'การ์ดสะสมสำหรับคอลเลกชันของคุณ'
                        )}
                    </p>

                    <div class="product-bottom">
                        <div>
                            <div class="price">
                                ${money(card.price)}
                            </div>

                            <small class="stock">
                                คงเหลือ ${Number(card.stock) || 0} ใบ
                            </small>
                        </div>

                        <button
                            class="btn btn-primary"
                            onclick="addToCart(${Number(card.id)})"
                            ${Number(card.stock) < 1 ? 'disabled' : ''}
                        >
                            + ใส่ตะกร้า
                        </button>
                    </div>
                </div>
            </article>
        `).join('');

    } catch (error) {
        $('#productGrid').innerHTML = `
            <div class="empty-state">
                ${esc(error.message)}
                <br>
                ตรวจสอบการเชื่อมต่อฐานข้อมูล MySQL
            </div>
        `;
    }
}



function openCardDetail(id) {
    const card = cardsCache.find((item) => Number(item.id) === Number(id));
    if (!card) return;

    $('#detailCardImage').src = card.image_url || '';
    $('#detailCardImage').alt = card.name;
    $('#detailCardCategory').textContent = card.category || '';
    $('#detailCardName').textContent = card.name || '';
    $('#detailCardDescription').textContent = card.description || 'ไม่มีรายละเอียดสินค้า';
    $('#detailCardPrice').textContent = money(card.price);
    $('#detailCardStock').textContent = `คงเหลือ ${Number(card.stock) || 0} ใบ`;
    $('#detailAddBtn').disabled = Number(card.stock) < 1;
    $('#detailAddBtn').onclick = () => addToCart(Number(card.id));
    $('#cardDetailModal').hidden = false;
}


async function addToCart(id) {
    try {
        const data = await api(`/api/cart/${id}`, {
            method: 'POST',
            body: JSON.stringify({ quantity: 1 })
        });

        $('#cartCount').textContent = data.cartCount;

        notice('เพิ่มการ์ดลงตะกร้าแล้ว');

    } catch (error) {
        notice(error.message, true);
    }
}

async function showCart() {
    try {
        const data = await api('/api/cart');

        const cartItems = $('#cartItems');

        cartItems.innerHTML = data.items.length
            ? data.items.map((card) => `
                <div class="cart-row">
                    <div>
                        <b>${esc(card.name)}</b>

                        <p>
                            ${money(card.price)} × ${card.quantity}
                        </p>

                        <div class="qty-controls">
                            <button
                                class="btn btn-outline"
                                onclick="changeQty(
                                    ${Number(card.id)},
                                    ${Number(card.quantity) - 1}
                                )"
                            >
                                −
                            </button>

                            <button
                                class="btn btn-outline"
                                onclick="changeQty(
                                    ${Number(card.id)},
                                    ${Number(card.quantity) + 1}
                                )"
                            >
                                +
                            </button>
                        </div>
                    </div>

                    <div>
                        <b>
                            ${money(card.price * card.quantity)}
                        </b>

                        <br>

                        <button
                            onclick="changeQty(${Number(card.id)}, 0)"
                        >
                            นำออก
                        </button>
                    </div>
                </div>
            `).join('')
            : `
                <div class="empty-state">
                    ตะกร้ายังว่างอยู่ ลองเลือกการ์ดที่ชอบดูสิ
                </div>
            `;

        $('#cartTotal').textContent = money(data.total);
        $('#cartModal').hidden = false;

    } catch (error) {
        notice(error.message, true);
    }
}

async function changeQty(id, quantity) {
    try {
        await api(`/api/cart/${id}`, {
            method: 'POST',
            body: JSON.stringify({ quantity })
        });

        const userData = await api('/api/me');

        $('#cartCount').textContent = userData.cartCount;

        await showCart();

    } catch (error) {
        showToast(error.message, 'error');
    }
}



function openAuth(mode = false) {
    registerMode = mode;

    $('#authModal').hidden = false;

    renderAuthMode();
}

function renderAuthMode() {
    $('#authTitle').textContent = registerMode
        ? 'สมัครสมาชิก'
        : 'เข้าสู่ระบบ';

    $('#authSubmit').textContent = registerMode
        ? 'สร้างบัญชี'
        : 'เข้าสู่ระบบ';

    $('#nameField').hidden = !registerMode;
    $('#nameField input').required = registerMode;

    $('#showLogin').classList.toggle('active', !registerMode);
    $('#showRegister').classList.toggle('active', registerMode);

    $('#authForm').elements.password.autocomplete = registerMode
        ? 'new-password'
        : 'current-password';
}



async function loadOrders() {
    if (!currentUser) return;

    try {
        const data = await api('/api/orders');

        $('#ordersList').innerHTML = data.orders.length
            ? data.orders.map((order) => `
                <article class="order-card">
                    <b>คำสั่งซื้อ #${order.id}</b>
                    · ${esc(order.status)}

                    <p>
                        ${new Date(order.created_at).toLocaleString('th-TH')}
                        · ${money(order.total_amount)}
                    </p>

                    <p>
                        ${order.items.map((item) => `
                            ${esc(item.card_name)} × ${item.quantity}
                        `).join('、')}
                    </p>
                </article>
            `).join('')
            : `
                <div class="empty-state">
                    ยังไม่มีคำสั่งซื้อ
                </div>
            `;

    } catch (error) {
        $('#ordersList').innerHTML = `
            <p>${esc(error.message)}</p>
        `;
    }
}



async function loadAdmin() {
    if (currentUser?.role !== 'admin') return;

    try {
        const data = await api('/api/admin/summary');

        $('#adminStats').innerHTML = `
            <div class="stat-card">
                <span>สมาชิกทั้งหมด</span>
                <b>${data.usersCount}</b>
            </div>

            <div class="stat-card">
                <span>การ์ดทั้งหมด</span>
                <b>${data.cardsCount}</b>
            </div>

            <div class="stat-card">
                <span>คำสั่งซื้อ</span>
                <b>${data.ordersCount}</b>
            </div>
        `;

        $('#adminCards').innerHTML = data.cards.map((card) => `
            <div class="admin-item">
                <div>
                    <b>${esc(card.name)}</b>

                    <small>
                        ${money(card.price)}
                        · คงเหลือ ${card.stock}
                        · ${card.is_active ? 'แสดงในร้าน' : 'ซ่อนอยู่'}
                    </small>
                </div>

                <div>
                    <button
                        class="btn btn-outline"
                        onclick="toggleCard(
                            ${Number(card.id)},
                            ${card.is_active ? 0 : 1}
                        )"
                    >
                        ${card.is_active ? 'ซ่อน' : 'แสดง'}
                    </button>

                    <button
                        class="btn btn-outline"
                        onclick="editCard(${Number(card.id)})"
                    >
                        แก้ไข
                    </button>

                    <button
                        class="btn btn-danger"
                        onclick="deleteCard(${Number(card.id)})"
                    >
                        ลบ
                    </button>
                </div>
            </div>
        `).join('');

        $('#adminOrders').innerHTML = data.orders.length
            ? data.orders.map((order) => `
                <div class="order-card">
                    <b>
                        #${order.id} ${esc(order.customer_name)}
                    </b>

                    · ${money(order.total_amount)}

                    <p>${esc(order.status)}</p>

                    <select id="status-${order.id}">
                        ${[
                            'รอชำระเงิน',
                            'ชำระเงินแล้ว',
                            'กำลังจัดส่ง',
                            'สำเร็จ',
                            'ยกเลิก'
                        ].map((status) => `
                            <option
                                ${status === order.status ? 'selected' : ''}
                            >
                                ${status}
                            </option>
                        `).join('')}
                    </select>

                    <button
                        class="btn btn-primary"
                        onclick="updateOrder(${Number(order.id)})"
                    >
                        บันทึกสถานะ
                    </button>
                </div>
            `).join('')
            : '<p>ยังไม่มีคำสั่งซื้อ</p>';

    } catch (error) {
        $('#adminStats').innerHTML = `
            <p>${esc(error.message)}</p>
        `;
    }
}

async function toggleCard(id, is_active) {
    try {
        await api(`/api/admin/cards/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active })
        });

        await loadAdmin();
        await loadCards();

    } catch (error) {
        showToast(error.message, 'error');
    }
}



async function deleteCard(id) {
    const item = cardsCache.find((card) => Number(card.id) === Number(id));
    const name = item?.name || 'สินค้านี้';

    if (!window.confirm(`ต้องการลบ “${name}” ใช่หรือไม่?\n\nข้อมูลสินค้าจะถูกลบออกจากร้าน และรูปที่ไม่มีสินค้าใช้งานแล้วจะถูกลบด้วย`)) {
        return;
    }

    try {
        await api(`/api/admin/cards/${id}`, { method: 'DELETE' });
        await loadAdmin();
        await loadCards();
        notice(`ลบ ${name} เรียบร้อยแล้ว`);
    } catch (error) {
        showToast(error.message, 'error');
    }
}


async function editCard(id) {
    let item = cardsCache.find(
        (card) => Number(card.id) === Number(id)
    );

    if (!item) {
        try {
            const data = await api('/api/admin/summary');

            item = data.cards.find(
                (card) => Number(card.id) === Number(id)
            );

        } catch {
            
        }
    }

    if (!item) {
        alert('ไม่พบสินค้า');
        return;
    }

    const form = $('#editCardForm');

    form.reset();

    form.elements.id.value = item.id;
    form.elements.name.value = item.name || '';
    form.elements.category.value = item.category || 'Pokémon';
    form.elements.description.value = item.description || '';

    form.dataset.currentImage = item.image_url || '';

    const preview = $('#editImagePreview');

    preview.removeAttribute('src');

    if (item.image_url) {
        preview.src = item.image_url;
        preview.hidden = false;
    } else {
        preview.hidden = true;
    }

    form.elements.price.value = item.price;
    form.elements.stock.value = item.stock;

    $('#editCardError').textContent = '';
    $('#editCardModal').hidden = false;

    form.elements.name.focus();
}




$('#editCardForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);
    const id = formData.get('id');
    const errorElement = $('#editCardError');

    const body = {
        name: String(formData.get('name') || '').trim(),
        category: formData.get('category'),
        description: String(formData.get('description') || '').trim(),
        image_url: form.dataset.currentImage || '',
        price: Number(formData.get('price')),
        stock: Number(formData.get('stock'))
    };

    const file = form.elements.image_file.files[0];

    errorElement.textContent = '';

    if (
        !body.name ||
        !Number.isFinite(body.price) ||
        body.price < 0 ||
        !Number.isInteger(body.stock) ||
        body.stock < 0
    ) {
        errorElement.textContent =
            'กรุณาตรวจสอบชื่อ ราคา และจำนวนสินค้า';
        return;
    }

    try {
        if (file) {
            body.image_data = await readImageFile(file);
        }

        await api(`/api/admin/cards/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(body)
        });

        $('#editCardModal').hidden = true;

        await loadAdmin();
        await loadCards();

        notice('บันทึกข้อมูลการ์ดเรียบร้อยแล้ว');
    } catch (error) {
        errorElement.textContent = error.message;
    }
});




async function updateOrder(id) {
    try {
        await api(`/api/admin/orders/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                status: $(`#status-${id}`).value
            })
        });

        alert('อัปเดตสถานะแล้ว');
        await loadAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    }
}




$('#searchBtn').addEventListener('click', loadCards);

$('#searchInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        loadCards();
    }
});

$('#categoryFilter').addEventListener('change', loadCards);

$('#productGrid').addEventListener('dblclick', (event) => {
    const card = event.target.closest('.product-card');
    if (!card) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    openCardDetail(Number(card.dataset.cardId));
});
$('#loginOpen').addEventListener('click', () => openAuth(false));

$('#showLogin').addEventListener('click', () => {
    registerMode = false;
    renderAuthMode();
});

$('#showRegister').addEventListener('click', () => {
    registerMode = true;
    renderAuthMode();
});

$('#cartOpen').addEventListener('click', showCart);




$('#logoutBtn').addEventListener('click', async () => {
    try {
        await api('/api/logout', {
            method: 'POST'
        });

        currentUser = null;
        updateUserUI();

        $('#cartCount').textContent = '0';

        notice('ออกจากระบบแล้ว');
    } catch (error) {
        showToast(error.message, 'error');
    }
});




document.querySelectorAll('[data-close]').forEach((button) => {
    button.addEventListener('click', () => {
        const modal = $(`#${button.dataset.close}`);

        if (modal) {
            modal.hidden = true;
        }
    });
});

document.querySelectorAll('.modal-backdrop').forEach((modal) => {
    modal.addEventListener('click', (event) => {
        if (event.target === modal) {
            modal.hidden = true;
        }
    });
});




$('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const body = Object.fromEntries(formData.entries());

    try {
        const data = await api(
            registerMode ? '/api/register' : '/api/login',
            {
                method: 'POST',
                body: JSON.stringify(body)
            }
        );

        currentUser = data.user;

        $('#authModal').hidden = true;
        updateUserUI();

        const userData = await api('/api/me');
        $('#cartCount').textContent = userData.cartCount;

        notice(data.message);

        if (currentUser.role === 'admin') {
            await loadAdmin();
        }

        await loadOrders();
    } catch (error) {
        showToast(error.message, 'error');
    }
});




$('#checkoutBtn').addEventListener('click', async () => {
    if (!currentUser) {
        $('#cartModal').hidden = true;
        openAuth(false);
        return;
    }

    try {
        const cart = await api('/api/cart');
        if (!cart.items.length) {
            notice('ตะกร้าสินค้ายังว่างอยู่', true);
            return;
        }

        $('#checkoutItems').innerHTML = cart.items.map((item) => `
            <div class="checkout-item">
                <img src="${esc(item.image_url || '')}" alt="${esc(item.name)}">
                <div>
                    <strong>${esc(item.name)}</strong>
                    <small>${money(item.price)} × ${item.quantity}</small>
                </div>
                <b>${money(item.price * item.quantity)}</b>
            </div>
        `).join('');

        $('#checkoutTotal').textContent = money(cart.total);
        $('#checkoutModal').hidden = false;
    } catch (error) {
        notice(error.message, true);
    }
});

$('#checkoutConfirmBtn').addEventListener('click', async () => {
    try {
        const cart = await api('/api/cart');
        if (!cart.items.length) {
            showToast('ตะกร้าสินค้าว่างแล้ว', 'error');
            return;
        }
        $('#checkoutModal').hidden = true;
        openPaymentModal(cart.total);
    } catch (error) {
        showToast(error.message, 'error');
    }
});

$('#paymentConfirmBtn').addEventListener('click', async () => {
    const button = $('#paymentConfirmBtn');
    button.disabled = true;
    button.textContent = 'กำลังยืนยัน...';

    try {
        const data = await api('/api/checkout', {
            method: 'POST',
            body: JSON.stringify({ payment_method: 'demo_qr' })
        });

        $('#paymentModal').hidden = true;
        $('#cartModal').hidden = true;
        showToast(data.message || 'ชำระเงินและสั่งซื้อสำเร็จ');

        await loadCards();
        await loadOrders();
        const userData = await api('/api/me');
        $('#cartCount').textContent = userData.cartCount || 0;

        if (currentUser?.role === 'admin') await loadAdmin();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        button.disabled = false;
        button.textContent = '✓ ฉันชำระเงินแล้ว';
    }
});

$('#reloadOrders').addEventListener('click', loadOrders);
$('#reloadAdmin').addEventListener('click', loadAdmin);



function readImageFile(file) {
    return new Promise((resolve, reject) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif'
        ];

        if (!allowedTypes.includes(file.type)) {
            reject(
                new Error('เลือกไฟล์ JPG, PNG, WEBP หรือ GIF เท่านั้น')
            );
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            reject(new Error('รูปภาพต้องมีขนาดไม่เกิน 5 MB'));
            return;
        }

        const reader = new FileReader();

        reader.onload = () => resolve(reader.result);

        reader.onerror = () => {
            reject(new Error('อ่านไฟล์รูปภาพไม่สำเร็จ'));
        };

        reader.readAsDataURL(file);
    });
}



$('#addCardForm').elements.image_file.addEventListener(
    'change',
    async (event) => {
        const image = $('#addImagePreview');
        const file = event.target.files[0];

        if (!file) {
            image.removeAttribute('src');
            image.hidden = true;
            return;
        }

        try {
            image.src = await readImageFile(file);
            image.hidden = false;
        } catch (error) {
            event.target.value = '';
            image.removeAttribute('src');
            image.hidden = true;
            showToast(error.message, 'error');
        }
    }
);




$('#editCardForm').elements.image_file.addEventListener(
    'change',
    async (event) => {
        const image = $('#editImagePreview');
        const file = event.target.files[0];

        if (!file) {
            const oldImage =
                $('#editCardForm').dataset.currentImage || '';

            if (oldImage) {
                image.src = oldImage;
                image.hidden = false;
            } else {
                image.removeAttribute('src');
                image.hidden = true;
            }

            return;
        }

        try {
            image.src = await readImageFile(file);
            image.hidden = false;
        } catch (error) {
            event.target.value = '';
            showToast(error.message, 'error');
        }
    }
);



$('#addCardForm').addEventListener('submit', async (event) => {
    event.preventDefault();

    const form = event.currentTarget;
    const formData = new FormData(form);

    const body = {
        name: String(formData.get('name') || '').trim(),
        category: formData.get('category'),
        description: String(formData.get('description') || '').trim(),
        price: Number(formData.get('price')),
        stock: Number(formData.get('stock'))
    };

    const file = form.elements.image_file.files[0];

    if (
        !body.name ||
        !Number.isFinite(body.price) ||
        body.price < 0 ||
        !Number.isInteger(body.stock) ||
        body.stock < 0
    ) {
        showToast('กรุณาตรวจสอบชื่อ ราคา และจำนวนสินค้า', 'error');
        return;
    }

    try {
        if (file) {
            body.image_data = await readImageFile(file);
        }

        const data = await api('/api/admin/cards', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        showToast(data.message || 'เพิ่มสินค้าเรียบร้อยแล้ว');

        form.reset();

        $('#addImagePreview').removeAttribute('src');
        $('#addImagePreview').hidden = true;

        await loadAdmin();
        await loadCards();
    } catch (error) {
        showToast(error.message, 'error');
    }
});



(async function initializeApp() {
    try {
        const data = await api('/api/me');

        currentUser = data.user;
        $('#cartCount').textContent = data.cartCount || 0;

        updateUserUI();
    } catch {
        currentUser = null;
        updateUserUI();
    }

    await loadCards();

    if (currentUser) {
        await loadOrders();

        if (currentUser.role === 'admin') {
            await loadAdmin();
        }
    }
})();