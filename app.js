// --- STATE & CONSTANTS ---
const GAS_URL_KEY = 'family_accounting_gas_url';
const GAS_PASS_KEY = 'family_accounting_gas_pass';
let gasUrl = localStorage.getItem(GAS_URL_KEY) || '';
let gasPass = localStorage.getItem(GAS_PASS_KEY) || '';
let chartInstance = null;
let globalExpensesData = []; // NEW

// --- DOM ELEMENTS ---
const views = {
    dashboard: document.getElementById('view-dashboard'),
    add: document.getElementById('view-add')
};
const navTriggers = document.querySelectorAll('[data-target]');
const form = document.getElementById('expense-form');
const submitBtn = document.getElementById('submit-btn');
const submitSpinner = document.getElementById('submit-spinner');
const dateInput = document.getElementById('fecha');

// Modal Elements
const modal = document.getElementById('settings-modal');
const gasInput = document.getElementById('gas-url-input');
const gasPassInput = document.getElementById('gas-password-input');
const saveUrlBtn = document.getElementById('save-url-btn');
const closeBtn = document.querySelector('.close-modal');
const openSettingsBtn = document.getElementById('open-settings-from-nav');

// Toast
const toast = document.getElementById('toast');
const toastMsg = document.getElementById('toast-msg');

// --- INITIALIZATION ---
function init() {
    // Set today's date
    dateInput.value = new Date().toISOString().split('T')[0];

    // Check configuration
    if (!gasUrl || !gasPass) {
        openModal();
    } else {
        // Load data on startup if everything is configured
        checkFormValidity();
        loadDashboardData();
    }

    // Attach Listeners
    setupNavigation();
    setupForm();
    setupModal();
    
    // Global Refresh & Selector
    document.getElementById('refresh-global-btn').addEventListener('click', loadDashboardData);
    document.getElementById('month-selector').addEventListener('change', () => {
        processDashboardData(globalExpensesData);
    });
}

// --- NAVIGATION ---
function setupNavigation() {
    navTriggers.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target');
            if (targetId === 'view-settings') return; // Handled separately
            
            // UI Updates
            document.querySelectorAll('.page-view').forEach(v => {
                v.classList.remove('active');
            });
            document.querySelectorAll('.nav-btn, .fab').forEach(n => {
                if(n.classList.contains('nav-btn')) n.classList.remove('active');
            });
            
            // Activate target
            views[targetId.replace('view-', '')].classList.add('active');
            if (btn.classList.contains('nav-btn')) btn.classList.add('active');
            
            // LOGIC ON TAB SWITCH (AUTO REFRESH)
            if (targetId === 'view-dashboard') {
                loadDashboardData();
            }
        });
    });
    
    openSettingsBtn.addEventListener('click', openModal);
}

function showToast(msg, isError = false) {
    toastMsg.textContent = msg;
    const icon = toast.querySelector('i');
    icon.className = isError ? 'ri-error-warning-line toast-icon' : 'ri-check-line toast-icon';
    icon.style.color = isError ? '#ef4444' : '#10b981';
    
    toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// --- CONFIG MODAL ---
function openModal() {
    gasInput.value = gasUrl;
    gasPassInput.value = gasPass;
    modal.classList.add('show');
}

function setupModal() {
    closeBtn.addEventListener('click', () => {
        if(gasUrl && gasPass) modal.classList.remove('show');
    });
    
    saveUrlBtn.addEventListener('click', () => {
        const url = gasInput.value.trim();
        const pass = gasPassInput.value.trim();
        if (url && pass) {
            localStorage.setItem(GAS_URL_KEY, url);
            localStorage.setItem(GAS_PASS_KEY, pass);
            gasUrl = url;
            gasPass = pass;
            modal.classList.remove('show');
            checkFormValidity();
            loadDashboardData();
            showToast("Configuración guardada");
        } else {
            alert("URL y Contraseña son obligatorios.");
        }
    });
}

// --- FORM HANDLING ---
function checkFormValidity() {
    submitBtn.disabled = !(form.checkValidity() && gasUrl && gasPass);
}

function setupForm() {
    form.addEventListener('input', checkFormValidity);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!gasUrl || !gasPass) { openModal(); return; }

        submitBtn.disabled = true;
        submitSpinner.style.display = 'block';

        const formData = new FormData(form);
        const data = {
            token: gasPass,
            id: new Date().getTime().toString(),
            FECHA: formData.get('fecha'),
            COMPRADOR: formData.get('comprador'),
            TIPO: formData.get('tipo'),
            CONCEPTO: formData.get('concepto'),
            IMPORTE: parseFloat(formData.get('importe')).toFixed(2),
            INFO: formData.get('info') || ''
        };

        try {
            // FIX POR CORS: Usamos plain text stringified
            // Apps Script lo recibirá en e.postData.contents sin lanzar Preflight
            const response = await fetch(gasUrl, {
                method: 'POST',
                body: JSON.stringify(data),
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                }
            });

            const result = await response.json();
            
            if (result.status === 'success') {
                showToast('¡Gasto registrado con éxito!');
                form.reset();
                dateInput.value = new Date().toISOString().split('T')[0];
                checkFormValidity();
                
                // AUTO REDIRECT TO DASHBOARD
                setTimeout(() => {
                    document.querySelector('[data-target="view-dashboard"]').click();
                }, 500);
                
            } else {
                showToast(result.message || 'Error guardando. Contraseña incorrecta.', true);
            }
        } catch (error) {
            console.error("Fetch Error:", error);
            // Si hay error de CORS en la respuesta, GAS pudo haberlo guardado igual
            showToast('Revisar si se guardó. Fallo de red detectado.', true);
        } finally {
            submitSpinner.style.display = 'none';
            checkFormValidity();
        }
    });
}

// --- DASHBOARD LOGIC ---
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

async function loadDashboardData() {
    if (!gasUrl || !gasPass) return;

    document.getElementById('dashboard-loading').style.display = 'flex';
    document.getElementById('dashboard-content').style.display = 'none';

    try {
        const urlReq = `${gasUrl}?token=${encodeURIComponent(gasPass)}&_t=${Date.now()}`;
        const response = await fetch(urlReq);
        const rawResponseText = await response.text();
        
        let dataObjects;
        try {
            dataObjects = JSON.parse(rawResponseText);
        } catch(e) {
            throw new Error("No se pudo parsear JSON. Verifica la URL de WebApp.");
        }
        
        if (dataObjects.error) {
            alert("Error: " + dataObjects.error);
            openModal();
            return;
        }
        
        globalExpensesData = Array.isArray(dataObjects) ? dataObjects : [];
        populateMonthSelector(globalExpensesData);
        processDashboardData(globalExpensesData);
        
        const now = new Date();
        document.getElementById('last-sync-time').textContent = `Act. ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        
        document.getElementById('dashboard-loading').style.display = 'none';
        document.getElementById('dashboard-content').style.display = 'block';

    } catch (error) {
        console.error("Dashboard Load Error:", error);
        document.getElementById('dashboard-loading').innerHTML = `
            <i class="ri-wifi-off-line" style="font-size: 30px; color: #ef4444; margin-bottom: 10px;"></i>
            <p style="color: #ef4444; font-size: 0.9rem;">Error de conexión.</p>
            <p style="color: #94a3b8; font-size: 0.75rem; margin-top: 8px; word-break: break-word;">Detalle: ${error.message}</p>
            <button onclick="openModal()" class="btn-submit" style="margin-top:15px; padding: 5px 15px; font-size: 0.8rem;">Revisar Enlace</button>
        `;
    }
}

function populateMonthSelector(data) {
    const selector = document.getElementById('month-selector');
    const prevValue = selector.value;
    
    let monthsSet = new Set();
    const today = new Date();
    monthsSet.add(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
    
    data.forEach(row => {
        if (!row.FECHA) return;
        const d = new Date(row.FECHA);
        if (!isNaN(d.getTime())) {
            monthsSet.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        }
    });
    
    const sortedMonths = Array.from(monthsSet).sort().reverse();
    
    selector.innerHTML = '';
    sortedMonths.forEach(ym => {
        const [y, m] = ym.split('-');
        const monthName = MONTHS[parseInt(m) - 1];
        const opt = document.createElement('option');
        opt.value = ym;
        opt.textContent = `${monthName} ${y}`;
        selector.appendChild(opt);
    });
    
    if (prevValue && monthsSet.has(prevValue)) {
        selector.value = prevValue;
    } else {
        selector.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    }
}

function processDashboardData(data) {
    const selectorVal = document.getElementById('month-selector').value;
    let targetMonth, targetYear;
    
    if (selectorVal) {
        const parts = selectorVal.split('-');
        targetYear = parseInt(parts[0]);
        targetMonth = parseInt(parts[1]);
    } else {
        const today = new Date();
        targetMonth = today.getMonth() + 1;
        targetYear = today.getFullYear();
    }
    
    let totalYear = 0;
    let totalMonth = 0;
    let tomasMonthPaid = 0;
    let esteMonthPaid = 0;
    
    let chartDataTypes = {};
    let recentHTML = '';
    let recentCount = 0;

    // Filtrar reverso (últimos primero)
    data.slice().reverse().forEach((row, index) => {
        if (!row.FECHA) return;
        const dateObj = new Date(row.FECHA);
        const rowMonth = dateObj.getMonth() + 1;
        const rowYear = dateObj.getFullYear();
        const importe = parseFloat(row.IMPORTE) || 0;

        // Anuales
        if (rowYear === targetYear) totalYear += importe;

        // Mensuales
        if (rowYear === targetYear && rowMonth === targetMonth) {
            totalMonth += importe;
            if (row.COMPRADOR === 'Tomás') tomasMonthPaid += importe;
            if (row.COMPRADOR === 'Estefanía') esteMonthPaid += importe;
            
            // Para el gráfico
            const tipo = row.TIPO || 'Varios';
            chartDataTypes[tipo] = (chartDataTypes[tipo] || 0) + importe;
        }

        // Historial Reciente (los 5 últimos globales del mes seleccionado)
        if (rowYear === targetYear && rowMonth === targetMonth && recentCount < 5) {
            const isTomas = row.COMPRADOR === 'Tomás';
            const dateStr = `${dateObj.getDate().toString().padStart(2,'0')}/${(dateObj.getMonth()+1).toString().padStart(2,'0')}`;
            recentHTML += `
                <div class="expense-item slide-up" style="animation-delay: ${index * 0.1}s">
                    <div class="exp-left">
                        <div class="exp-avatar" style="background: ${isTomas ? 'var(--tomas-color)' : 'var(--este-color)'}">
                            ${isTomas ? 'T' : 'E'}
                        </div>
                        <div class="exp-desc">
                            <span class="exp-concept">${row.CONCEPTO}</span>
                            <span class="exp-date">${dateStr} • ${row.TIPO}</span>
                        </div>
                    </div>
                    <span class="exp-amount">${importe.toFixed(2)}€</span>
                </div>
            `;
            recentCount++;
        }
    });

    // Validar si está vacío el local para ese mes
    if(recentHTML === '') recentHTML = '<p class="small-text center mt-10">Sin gastos este mes</p>';
    document.getElementById('recent-expenses').innerHTML = recentHTML;

    // Actualizar Textos
    document.getElementById('total-year').textContent = `${totalYear.toFixed(2)}€`;
    document.getElementById('total-month').textContent = `${totalMonth.toFixed(2)}€`;
    document.getElementById('tomas-paid').textContent = `${tomasMonthPaid.toFixed(2)}€`;
    document.getElementById('estefania-paid').textContent = `${esteMonthPaid.toFixed(2)}€`;

    // Lógica 50%
    const diff = Math.abs(tomasMonthPaid - esteMonthPaid);
    const amountToOwe = diff / 2;
    const balanceCard = document.querySelector('.balance-card');

    if (amountToOwe === 0 || totalMonth === 0) {
        document.getElementById('balance-result').textContent = `Todo en paz`;
        document.getElementById('balance-subtext').textContent = totalMonth === 0 ? `Sin gastos` : `Gastos igualados (50/50)`;
        balanceCard.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.8), rgba(5, 150, 105, 0.8))';
    } else if (tomasMonthPaid > esteMonthPaid) {
        document.getElementById('balance-result').textContent = `Est. debe ${amountToOwe.toFixed(2)}€`;
        document.getElementById('balance-subtext').textContent = `A Tomás`;
        balanceCard.style.background = 'linear-gradient(135deg, rgba(236, 72, 153, 0.8), rgba(190, 24, 93, 0.8))';
    } else {
        document.getElementById('balance-result').textContent = `Tom. debe ${amountToOwe.toFixed(2)}€`;
        document.getElementById('balance-subtext').textContent = `A Estefanía`;
        balanceCard.style.background = 'linear-gradient(135deg, rgba(14, 165, 233, 0.8), rgba(37, 99, 235, 0.8))';
    }

    // Renderizar Gráfico
    renderChart(chartDataTypes);
}

// --- CHART.JS ---
function renderChart(dataObj) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }
    
    const labels = Object.keys(dataObj);
    const data = Object.values(dataObj);
    
    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#64748b'
                ],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#94a3b8', font: { family: 'Plus Jakarta Sans', size: 10 } }
                }
            }
        }
    });
}

// Init Application
document.addEventListener('DOMContentLoaded', init);
