// =========================================================
// DATAWAVES GUILLOTINE OPTIMIZER 2D - MOTOR POR BLOQUES/TIRAS
// =========================================================

const SUPABASE_URL = 'https://sksanvauywgjxmxujicl.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2fuRdNLrO24nN5HA6e8lmw_v6IYVleX';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let sheetsList = [
    { id: 1, desc: 'Chapa 1', width: 1220, height: 2440, partsList: [] }
];
let activeSheetId = 1;
let editingPartIndex = null;
let partColorsMap = {};
let currentLoadedId = null; 
let isColorBlindMode = false;

function getActiveSheet() {
    return sheetsList.find(s => s.id === activeSheetId) || sheetsList[0];
}

function getOrderData() {
    return {
        id: (document.getElementById('doc-id')?.value || '').trim(),
        of: (document.getElementById('doc-of')?.value || '').trim(),
        cliente: (document.getElementById('doc-cliente')?.value || '').trim(),
        obra: (document.getElementById('doc-obra')?.value || '').trim()
    };
}

function clearOrderDataFields() {
    ['doc-id', 'doc-of', 'doc-cliente', 'doc-obra'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function setOrderDataFields(orderData) {
    if (!orderData) {
        clearOrderDataFields();
        return;
    }
    const docId = document.getElementById('doc-id');
    const docOf = document.getElementById('doc-of');
    const docCliente = document.getElementById('doc-cliente');
    const docObra = document.getElementById('doc-obra');

    if (docId) docId.value = orderData.id || '';
    if (docOf) docOf.value = orderData.of || '';
    if (docCliente) docCliente.value = orderData.cliente || '';
    if (docObra) docObra.value = orderData.obra || '';
}

function formatDocNameWithOF(baseName, ofVal) {
    let cleanName = baseName.trim();
    cleanName = cleanName.replace(/^OF\s+\d+\s*-\s*/i, '');
    if (ofVal && ofVal.trim() !== '') {
        return `OF ${ofVal.trim()} - ${cleanName}`;
    }
    return cleanName;
}

function hasAnyParts() {
    return sheetsList.some(s => s.partsList.length > 0);
}

function updateButtonStates() {
    const projectName = document.getElementById('project-name').value.trim();
    const saveBtn = document.getElementById('btn-save-project');
    const updateBtn = document.getElementById('btn-update-project');
    const deleteBtn = document.getElementById('btn-delete-project');
    const exportBtn = document.getElementById('btn-export-project');
    const select = document.getElementById('saved-projects-select');

    const valid = projectName.length > 0 && hasAnyParts();

    saveBtn.disabled = !valid;
    updateBtn.disabled = !(currentLoadedId && valid);

    if (select && select.value !== "") {
        deleteBtn.disabled = false;
        if (exportBtn) exportBtn.disabled = false;
    } else {
        deleteBtn.disabled = true;
        if (exportBtn) exportBtn.disabled = true;
    }
}

// =========================================================
// GESTIÓN DE PESTAÑAS / CHAPAS
// =========================================================

function renderTabs() {
    const container = document.getElementById('sheets-tabs-container');
    container.innerHTML = '';

    sheetsList.forEach((sheet) => {
        const div = document.createElement('div');
        div.className = `sheet-tab ${sheet.id === activeSheetId ? 'active' : ''}`;
        div.innerHTML = `
            <span>${sheet.desc.toUpperCase()} (${sheet.width}x${sheet.height})</span>
            ${sheetsList.length > 1 ? `<span class="close-tab" data-id="${sheet.id}">&times;</span>` : ''}
        `;

        div.addEventListener('click', (e) => {
            if (e.target.classList.contains('close-tab')) {
                e.stopPropagation();
                removeSheet(sheet.id);
            } else {
                activeSheetId = sheet.id;
                editingPartIndex = null;
                renderTabs();
                loadActiveSheetForm();
            }
        });

        container.appendChild(div);
    });
}

function loadActiveSheetForm() {
    const sheet = getActiveSheet();
    document.getElementById('active-sheet-desc').value = sheet.desc;
    document.getElementById('active-sheet-width').value = sheet.width;
    document.getElementById('active-sheet-height').value = sheet.height;
    renderPartsTable();
}

document.getElementById('btn-add-sheet').addEventListener('click', () => {
    const newId = Date.now();
    const nextNum = sheetsList.length + 1;
    sheetsList.push({
        id: newId,
        desc: `Chapa ${nextNum}`,
        width: 1220,
        height: 2440,
        partsList: []
    });
    activeSheetId = newId;
    editingPartIndex = null;
    renderTabs();
    loadActiveSheetForm();
    updateButtonStates();
});

function removeSheet(id) {
    if (sheetsList.length <= 1) return;
    if (window.confirm('¿ESTÁ SEGURO DE ELIMINAR ESTA CHAPA Y TODAS SUS PIEZAS?')) {
        sheetsList = sheetsList.filter(s => s.id !== id);
        if (activeSheetId === id) {
            activeSheetId = sheetsList[0].id;
        }
        editingPartIndex = null;
        renderTabs();
        loadActiveSheetForm();
        updateButtonStates();
    }
}

document.getElementById('active-sheet-desc').addEventListener('input', (e) => {
    const s = getActiveSheet();
    s.desc = e.target.value.trim() || 'Chapa Sin Nombre';
    renderTabs();
});

document.getElementById('active-sheet-width').addEventListener('change', (e) => {
    const s = getActiveSheet();
    s.width = parseFloat(e.target.value) || 100;
    renderTabs();
});

document.getElementById('active-sheet-height').addEventListener('change', (e) => {
    const s = getActiveSheet();
    s.height = parseFloat(e.target.value) || 100;
    renderTabs();
});

// =========================================================
// SUPABASE Y PERSISTENCIA (TABLA: guillotine_projects)
// =========================================================

async function populateSavedProjectsDropdown(keepSelected = true) {
    const select = document.getElementById('saved-projects-select');
    if (!select) return;

    const previousValue = select.value;

    const { data, error } = await supabaseClient
        .from('guillotine_projects')
        .select('doc_name')
        .order('updated_at', { ascending: false });

    if (error) {
        console.error('Error al cargar proyectos de Supabase:', error);
        return;
    }

    select.innerHTML = '<option value="">-- SELECCIONAR --</option>';

    data.forEach(row => {
        const option = document.createElement('option');
        option.value = row.doc_name;
        option.textContent = row.doc_name.toUpperCase();
        select.appendChild(option);
    });
    
    if (keepSelected && previousValue) {
        select.value = previousValue;
    } else if (currentLoadedId) {
        select.value = currentLoadedId;
    }
    
    updateButtonStates();
}

function initRealtimeSync() {
    supabaseClient
        .channel('public:guillotine_projects')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'guillotine_projects' }, () => {
            populateSavedProjectsDropdown(true);
        })
        .subscribe();
}

document.getElementById('project-name').addEventListener('input', updateButtonStates);

document.getElementById('btn-colorblind-mode').addEventListener('click', () => {
    isColorBlindMode = !isColorBlindMode;
    const btn = document.getElementById('btn-colorblind-mode');
    if (isColorBlindMode) {
        btn.classList.add('active-mode');
        btn.style.backgroundColor = 'rgba(179, 85, 0, 0.2)';
        btn.style.borderRadius = '4px';
    } else {
        btn.classList.remove('active-mode');
        btn.style.backgroundColor = 'transparent';
    }

    if (hasAnyParts()) {
        document.getElementById('btn-optimize').click();
    }
});

let lastSelectedValue = "";

document.getElementById('saved-projects-select').addEventListener('change', async function() {
    const selectedDoc = this.value;
    const hasProgress = document.getElementById('project-name').value.trim().length > 0 || hasAnyParts();

    if (selectedDoc === "") {
        if (hasProgress) {
            if (!window.confirm('¿CREAR UN NUEVO PROYECTO? SE PERDERÁ EL PROGRESO NO GUARDADO.')) {
                this.value = lastSelectedValue;
                return;
            }
        }
        executeNewProjectReset();
        lastSelectedValue = "";
        return;
    }

    if (hasProgress) {
        if (!window.confirm('¿CARGAR REGISTRO EXISTENTE? PERDERÁ EL PROGRESO ACTUAL.')) {
            this.value = lastSelectedValue;
            return;
        }
    }

    lastSelectedValue = selectedDoc;
    await loadProjectData(selectedDoc);
});

async function loadProjectData(selectedDoc) {
    const { data, error } = await supabaseClient
        .from('guillotine_projects')
        .select('*')
        .eq('doc_name', selectedDoc)
        .single();

    if (error || !data) {
        alert('NO SE PUDO OBTENER EL DOCUMENTO DESDE LA NUBE.');
        return;
    }

    currentLoadedId = data.doc_name;
    document.getElementById('project-name').value = data.doc_name;
    document.getElementById('blade-width').value = 0;
    
    sheetsList = JSON.parse(JSON.stringify(data.sheets_list || []));
    if (sheetsList.length === 0) {
        sheetsList = [{ id: 1, desc: 'Chapa 1', width: 1220, height: 2440, partsList: [] }];
    }
    activeSheetId = sheetsList[0].id;
    editingPartIndex = null;

    setOrderDataFields(data.order_data);
    renderTabs();
    loadActiveSheetForm();
    updateButtonStates();
    
    document.getElementById('btn-optimize').click();
}

function executeNewProjectReset() {
    currentLoadedId = null;
    document.getElementById('project-name').value = '';
    document.getElementById('blade-width').value = '0';
    document.getElementById('saved-projects-select').value = '';
    document.getElementById('part-name').value = '';
    document.getElementById('part-width').value = '';
    document.getElementById('part-height').value = '';
    document.getElementById('part-qty').value = '';
    
    clearOrderDataFields();

    sheetsList = [{ id: 1, desc: 'Chapa 1', width: 1220, height: 2440, partsList: [] }];
    activeSheetId = sheetsList[0].id;
    editingPartIndex = null;

    renderTabs();
    loadActiveSheetForm();
    updateButtonStates();

    document.getElementById('results-container').innerHTML = 'AGREGUE PIEZAS Y PRESIONE "CALCULAR GUILLOTINA" PARA GENERAR LOS DIBUJOS Y LISTADOS.';
}

document.getElementById('btn-save-project').addEventListener('click', async () => {
    let rawDocName = document.getElementById('project-name').value.trim();
    const ofVal = document.getElementById('doc-of').value.trim();
    let docName = formatDocNameWithOF(rawDocName, ofVal).toUpperCase();
    document.getElementById('project-name').value = docName;

    if (!docName || !hasAnyParts()) {
        alert('DEBE INGRESAR UN NOMBRE Y AL MENOS UNA PIEZA EN ALGUNA CHAPA.');
        return;
    }

    const { data: existing } = await supabaseClient
        .from('guillotine_projects')
        .select('doc_name')
        .eq('doc_name', docName)
        .single();

    if (existing) {
        alert('YA EXISTE UN REGISTRO CON ESTE NOMBRE EN LA NUBE.');
        return;
    }

    const projectData = {
        doc_name: docName,
        blade_width: 0,
        sheets_list: sheetsList,
        order_data: getOrderData(),
        updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient.from('guillotine_projects').insert([projectData]);

    if (error) {
        alert('ERROR AL GUARDAR EN LA NUBE: ' + error.message);
        return;
    }

    currentLoadedId = docName;
    await populateSavedProjectsDropdown(false);
    document.getElementById('saved-projects-select').value = docName;
    lastSelectedValue = docName;
    updateButtonStates();
    alert(`EL REGISTRO "${docName}" HA SIDO GUARDADO EN LA NUBE EXITOSAMENTE.`);
});

document.getElementById('btn-update-project').addEventListener('click', async () => {
    let rawDocName = document.getElementById('project-name').value.trim();
    const ofVal = document.getElementById('doc-of').value.trim();
    let docName = formatDocNameWithOF(rawDocName, ofVal).toUpperCase();
    document.getElementById('project-name').value = docName;

    if (!docName || !hasAnyParts() || !currentLoadedId) {
        alert('NO HAY UN REGISTRO CARGADO PARA ACTUALIZAR.');
        return;
    }

    if (!window.confirm('¿ACTUALIZAR ESTE REGISTRO EN LA NUBE?')) return;

    if (currentLoadedId !== docName) {
        await supabaseClient.from('guillotine_projects').delete().eq('doc_name', currentLoadedId);
    }

    const projectData = {
        doc_name: docName,
        blade_width: 0,
        sheets_list: sheetsList,
        order_data: getOrderData(),
        updated_at: new Date().toISOString()
    };

    const { error } = await supabaseClient.from('guillotine_projects').upsert([projectData]);

    if (error) {
        alert('ERROR AL ACTUALIZAR: ' + error.message);
        return;
    }

    currentLoadedId = docName;
    await populateSavedProjectsDropdown(false);
    document.getElementById('saved-projects-select').value = docName;
    lastSelectedValue = docName;
    updateButtonStates();
    alert(`EL REGISTRO "${docName}" FUE ACTUALIZADO CON ÉXITO.`);
});

document.getElementById('btn-delete-project').addEventListener('click', async () => {
    const selectedDoc = document.getElementById('saved-projects-select').value;
    if (!selectedDoc) return;

    if (!window.confirm(`¿ELIMINAR "${selectedDoc}" DE LA NUBE PARA TODOS?`)) return;

    const { error } = await supabaseClient.from('guillotine_projects').delete().eq('doc_name', selectedDoc);

    if (error) {
        alert('ERROR AL ELIMINAR: ' + error.message);
        return;
    }

    if (currentLoadedId === selectedDoc) {
        currentLoadedId = null;
        clearOrderDataFields();
    }
    
    await populateSavedProjectsDropdown(false);
    document.getElementById('saved-projects-select').value = "";
    lastSelectedValue = "";
    updateButtonStates();
    alert(`EL REGISTRO "${selectedDoc}" FUE ELIMINADO CON ÉXITO.`);
});

document.getElementById('btn-export-project').addEventListener('click', async () => {
    const selectedDoc = document.getElementById('saved-projects-select').value;
    if (!selectedDoc) return;

    const { data, error } = await supabaseClient.from('guillotine_projects').select('*').eq('doc_name', selectedDoc).single();
    if (error || !data) return;

    const exportObject = {
        docName: data.doc_name,
        bladeWidth: 0,
        sheetsList: data.sheets_list,
        orderData: data.order_data,
        updatedAt: data.updated_at
    };

    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedDoc.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

document.getElementById('btn-import-project').addEventListener('click', () => {
    document.getElementById('import-file-input').click();
});

document.getElementById('import-file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const project = JSON.parse(evt.target.result);
            if (!project.docName || !project.sheetsList) {
                alert('ARCHIVO INVÁLIDO.');
                return;
            }

            const docName = project.docName.toUpperCase();
            const projectData = {
                doc_name: docName,
                blade_width: 0,
                sheets_list: project.sheetsList,
                order_data: project.orderData || {},
                updated_at: new Date().toISOString()
            };

            const { error } = await supabaseClient.from('guillotine_projects').upsert([projectData]);
            if (error) {
                alert('ERROR AL SUBIR: ' + error.message);
                return;
            }

            await populateSavedProjectsDropdown(false);
            document.getElementById('saved-projects-select').value = docName;
            lastSelectedValue = docName;
            updateButtonStates();

            if (window.confirm(`REGISTRO "${docName}" IMPORTADO. ¿CARGAR AHORA?`)) {
                currentLoadedId = project.docName;
                document.getElementById('project-name').value = project.docName;
                document.getElementById('blade-width').value = 0;
                sheetsList = JSON.parse(JSON.stringify(project.sheetsList || []));
                activeSheetId = sheetsList[0].id;
                setOrderDataFields(project.orderData);
                renderTabs();
                loadActiveSheetForm();
                updateButtonStates();
                document.getElementById('btn-optimize').click();
            }
        } catch (err) {
            alert('ERROR: ' + err.message);
        }
        e.target.value = '';
    };

    reader.readAsText(file);
});

// =========================================================
// GESTIÓN DE PIEZAS
// =========================================================

document.getElementById('btn-add-part').addEventListener('click', () => {
    const name = document.getElementById('part-name').value.trim();
    const width = parseFloat(document.getElementById('part-width').value);
    const height = parseFloat(document.getElementById('part-height').value);
    const qty = parseInt(document.getElementById('part-qty').value);

    const sheet = getActiveSheet();

    if (!name || isNaN(width) || width <= 0 || isNaN(height) || height <= 0 || isNaN(qty) || qty <= 0) {
        alert('POR FAVOR COMPLETE CORRECTAMENTE LOS CAMPOS DE LA PIEZA.');
        return;
    }

    const maxSheetDim = Math.max(sheet.width, sheet.height);
    const minSheetDim = Math.min(sheet.width, sheet.height);
    const maxPartDim = Math.max(width, height);
    const minPartDim = Math.min(width, height);

    if (maxPartDim > maxSheetDim || minPartDim > minSheetDim) {
        alert(`LA PIEZA EXCEDE LAS DIMENSIONES DE ESTA CHAPA (${sheet.width} x ${sheet.height} mm).`);
        return;
    }

    const addBtn = document.getElementById('btn-add-part');

    if (editingPartIndex !== null) {
        sheet.partsList[editingPartIndex] = { name, width, height, qty };
        editingPartIndex = null;
        addBtn.title = 'Agregar pieza a esta chapa';
    } else {
        sheet.partsList.push({ name, width, height, qty });
    }

    renderPartsTable();
    updateButtonStates();

    document.getElementById('part-name').value = '';
    document.getElementById('part-width').value = '';
    document.getElementById('part-height').value = '';
    document.getElementById('part-qty').value = '';
    document.getElementById('part-name').focus();
});

function renderPartsTable() {
    const tbody = document.getElementById('parts-table-body');
    tbody.innerHTML = '';
    const sheet = getActiveSheet();

    if (!sheet || sheet.partsList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: #555566; padding: 12px; font-size: 11px;">NO HAY PIEZAS EN ESTA CHAPA.</td></tr>`;
        return;
    }

    sheet.partsList.forEach((part, index) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2a36';

        let isEditing = (index === editingPartIndex);
        let rowStyle = isEditing ? 'color: #e06b00 !important; font-weight: bold;' : 'color: #c2c2d0;';

        tr.innerHTML = `
            <td style="padding: 6px 10px; font-size: 11px;"><span style="${rowStyle}">${part.name.toUpperCase()}</span></td>
            <td style="padding: 6px 10px; font-size: 11px;"><span style="${rowStyle}">${part.width} x ${part.height} mm</span></td>
            <td style="padding: 6px 10px; font-size: 11px; text-align: center;"><span style="${rowStyle}">${part.qty}</span></td>
            <td style="padding: 6px 10px; text-align: center;">
                <div style="display: inline-flex; gap: 10px; justify-content: center; align-items: center;">
                    <button class="icon-btn btn-action-edit" data-index="${index}" title="${isEditing ? 'Cancelar' : 'Editar'}">
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="icon-btn btn-action-delete" data-index="${index}" title="Eliminar">
                        <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.querySelectorAll('.btn-action-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.btn-action-edit').getAttribute('data-index'));
            editPart(index);
        });
    });

    document.querySelectorAll('.btn-action-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.closest('.btn-action-delete').getAttribute('data-index'));
            confirmRemovePart(index);
        });
    });
}

function editPart(index) {
    const sheet = getActiveSheet();
    const addBtn = document.getElementById('btn-add-part');

    if (editingPartIndex === index) {
        editingPartIndex = null;
        addBtn.title = 'Agregar pieza a esta chapa';
        document.getElementById('part-name').value = '';
        document.getElementById('part-width').value = '';
        document.getElementById('part-height').value = '';
        document.getElementById('part-qty').value = '';
        renderPartsTable();
        return;
    }

    const part = sheet.partsList[index];
    document.getElementById('part-name').value = part.name;
    document.getElementById('part-width').value = part.width;
    document.getElementById('part-height').value = part.height;
    document.getElementById('part-qty').value = part.qty;
    editingPartIndex = index;
    
    addBtn.title = 'Actualizar pieza';
    renderPartsTable();
    document.getElementById('part-name').focus();
}

function confirmRemovePart(index) {
    const sheet = getActiveSheet();
    const part = sheet.partsList[index];
    if (window.confirm(`¿ELIMINAR LA PIEZA "${part.name.toUpperCase()}" DE ESTA CHAPA?`)) {
        sheet.partsList.splice(index, 1);
        if (editingPartIndex === index) editingPartIndex = null;
        renderPartsTable();
        updateButtonStates();
    }
}

function getPartColor(name) {
    if (!partColorsMap[name]) {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        let hue = Math.abs(hash * 137) % 360;
        partColorsMap[name] = {
            normal: `hsl(${hue}, 70%, 55%)`,
            colorblind: `hsl(${(hue * 3) % 360}, 90%, 45%)`
        };
    }
    return isColorBlindMode ? partColorsMap[name].colorblind : partColorsMap[name].normal;
}

// =========================================================
// OPTIMIZADOR INTELIGENTE POR MÓDULOS / BLOQUES (STRIP NESTING)
// =========================================================

document.getElementById('btn-optimize').addEventListener('click', () => {
    const projectName = document.getElementById('project-name').value.trim() || 'PROYECTO SIN NOMBRE';
    const isSimplifyCuts = document.getElementById('chk-no-problems')?.checked ?? false;
    const isNoRotation = document.getElementById('chk-no-rotation')?.checked ?? false;
    const allowRotation = !isNoRotation;

    if (!hasAnyParts()) {
        alert('DEBE AGREGAR AL MENOS UNA PIEZA EN ALGUNA CHAPA PARA CALCULAR.');
        return;
    }

    let allGeneratedPrograms = [];

    sheetsList.forEach((sheetModule) => {
        if (sheetModule.partsList.length === 0) return;

        let sheetW = Math.max(sheetModule.width, sheetModule.height);
        let sheetH = Math.min(sheetModule.width, sheetModule.height);

        // Clona y organiza piezas agrupándolas por tipo y dimensiones
        let partsQueue = sheetModule.partsList.map(p => ({
            name: p.name,
            w: p.width,
            h: p.height,
            qty: p.qty
        }));

        let compiledSheets = [];

        while (hasRemainingParts(partsQueue)) {
            let sheet = { 
                width: sheetW, 
                height: sheetH, 
                desc: sheetModule.desc, 
                freeRects: [{ x: 0, y: 0, w: sheetW, h: sheetH }], 
                placedItems: [] 
            };

            packSheetByBlocks(sheet, partsQueue, allowRotation, isSimplifyCuts);
            compiledSheets.push(sheet);
        }

        allGeneratedPrograms.push(...compiledSheets);
    });

    // Agrupa planos idénticos (P1, P2...)
    let groupedPrograms = [];
    allGeneratedPrograms.forEach((sheet) => {
        let signature = `${sheet.desc}_${sheet.width}x${sheet.height}_` + sheet.placedItems.map(it => 
            `${it.name}-${it.w}x${it.h}-${it.x},${it.y}`
        ).sort().join('|');

        let found = groupedPrograms.find(g => g.signature === signature);
        if (found) {
            found.count++;
        } else {
            groupedPrograms.push({
                signature: signature,
                sheet: sheet,
                count: 1
            });
        }
    });

    renderFinalResults(projectName, groupedPrograms);
});

function hasRemainingParts(queue) {
    return queue.some(p => p.qty > 0);
}

// Algoritmo principal de empaquetado por tiras/bloques continuos
function packSheetByBlocks(sheet, partsQueue, allowRotation, isSimplifyCuts) {
    // Ordena los tipos de pieza por área descendente
    partsQueue.sort((a, b) => (b.w * b.h) - (a.w * a.h));

    for (let partType of partsQueue) {
        if (partType.qty <= 0) continue;

        let orientations = [{ w: partType.w, h: partType.h }];
        if (allowRotation && partType.w !== partType.h) {
            orientations.push({ w: partType.h, h: partType.w });
        }

        while (partType.qty > 0) {
            let placed = false;

            // Busca la mejor ubicación modular
            for (let rectIdx = 0; rectIdx < sheet.freeRects.length; rectIdx++) {
                let rect = sheet.freeRects[rectIdx];

                for (let ori of orientations) {
                    if (ori.w <= rect.w && ori.h <= rect.h) {
                        
                        // Determina cuántas entran juntas a lo ancho y largo en el espacio disponible
                        let countX = Math.min(partType.qty, Math.floor(rect.w / ori.w));
                        let countY = 1;

                        // Si entran más de 1 fila de la misma pieza, forma un bloque uniforme (Grid/Strip)
                        if (partType.qty >= countX * 2 && Math.floor(rect.h / ori.h) >= 2) {
                            countY = Math.min(Math.floor(partType.qty / countX), Math.floor(rect.h / ori.h));
                        }

                        if (countX <= 0 || countY <= 0) continue;

                        let totalPlaced = countX * countY;
                        let blockW = countX * ori.w;
                        let blockH = countY * ori.h;

                        // Coloca el bloque completo de piezas unificadas
                        for (let cy = 0; cy < countY; cy++) {
                            for (let cx = 0; cx < countX; cx++) {
                                sheet.placedItems.push({
                                    name: partType.name,
                                    w: ori.w,
                                    h: ori.h,
                                    x: rect.x + (cx * ori.w),
                                    y: rect.y + (cy * ori.h)
                                });
                            }
                        }

                        partType.qty -= totalPlaced;

                        // Subdivide el espacio sobrante respetando bloques completos de remanente libre
                        sheet.freeRects.splice(rectIdx, 1);

                        let rightRemW = rect.w - blockW;
                        let bottomRemH = rect.h - blockH;

                        // Si queda retazo grande a la derecha o abajo, se reserva como bloque único (ej. 600x1220)
                        if (rightRemW > 0) {
                            sheet.freeRects.push({
                                x: rect.x + blockW,
                                y: rect.y,
                                w: rightRemW,
                                h: rect.h
                            });
                        }

                        if (bottomRemH > 0) {
                            sheet.freeRects.push({
                                x: rect.x,
                                y: rect.y + blockH,
                                w: blockW,
                                h: bottomRemH
                            });
                        }

                        sheet.freeRects = cleanupRects(sheet.freeRects);
                        placed = true;
                        break;
                    }
                }
                if (placed) break;
            }

            if (!placed) break; // Si no cupo en ningún retazo libre, pasa a la siguiente chapa
        }
    }
}

function cleanupRects(rects) {
    let result = [];
    rects = rects.filter(r => r.w > 0 && r.h > 0);

    for (let i = 0; i < rects.length; i++) {
        let r1 = rects[i];
        let contained = false;
        
        for (let j = 0; j < rects.length; j++) {
            if (i === j) continue;
            let r2 = rects[j];
            
            // Elimina sub-rectángulos absorbidos por otros mayores
            if (r1.x >= r2.x && r1.y >= r2.y && 
                (r1.x + r1.w) <= (r2.x + r2.w) && 
                (r1.y + r1.h) <= (r2.y + r2.h)) {
                contained = true;
                break;
            }
        }
        if (!contained) {
            result.push(r1);
        }
    }

    // Ordena de arriba a abajo, de izquierda a derecha para mantener el flujo visual
    return result.sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

// =========================================================
// RENDERIZADO VISUAL Y PLANOS DE CORTE
// =========================================================

function renderFinalResults(projectName, groupedPrograms) {
    const container = document.getElementById('results-container');
    let html = `
        <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 12px;">
                <span>PROYECTO: <strong>${projectName.toUpperCase()}</strong></span>
            </div>
            <button id="btn-print-report" class="btn-app" style="background-color: #b35500; color: #ffffff;">IMPRIMIR PLANOS NESTING (A4)</button>
        </div>
    `;

    let programCounter = 1;

    groupedPrograms.forEach((group) => {
        let pName = `P${programCounter++} - ${projectName.toUpperCase()}`;
        let sheet = group.sheet;
        let sheetW = sheet.width;  
        let sheetH = sheet.height; 

        let summaryPartsMap = {};
        let usedArea = 0;

        sheet.placedItems.forEach(it => {
            usedArea += (it.w * it.h);
            let key = `${it.name}_${it.w}_${it.h}`;
            if (!summaryPartsMap[key]) {
                summaryPartsMap[key] = { name: it.name, w: it.w, h: it.h, qty: 0 };
            }
            summaryPartsMap[key].qty++;
        });

        let efficiency = ((usedArea / (sheetW * sheetH)) * 100).toFixed(1);
        let maxUsedY = sheet.placedItems.reduce((acc, it) => Math.max(acc, it.y + it.h), 0);
        let remanenteA = { w: sheetW, h: sheetH - maxUsedY };
        let maxUsedX = sheet.placedItems.length > 0 ? Math.max(...sheet.placedItems.map(it => it.x + it.w)) : 0;
        let remanenteB = { w: sheetW - maxUsedX, h: maxUsedY };

        html += `
            <div class="program-card" style="background: #181822; border: 1px solid #2a2a38; border-radius: 6px; padding: 18px; margin-bottom: 22px;">
                
                <div style="display: grid; grid-template-columns: 2.2fr 1fr 1fr; gap: 20px; align-items: center;">
                    
                    <div style="position: relative;">
                        <div style="font-size: 11px; font-weight: bold; color: #a5a5b5; margin-bottom: 8px;">${pName}</div>
                        
                        <svg viewBox="0 0 ${sheetW} ${sheetH}" style="width: 100%; height: auto; max-height: 380px; display: block;">
                            <rect x="0" y="0" width="${sheetW}" height="${sheetH}" fill="#14141c" stroke="#3a3a4c" stroke-width="2"/>

                            ${sheet.placedItems.map(it => {
                                let color = getPartColor(it.name);
                                return `
                                    <g>
                                        <rect x="${it.x}" y="${it.y}" width="${it.w}" height="${it.h}" fill="${color}" stroke="#121217" stroke-width="1.5"/>
                                        <text x="${it.x + it.w/2}" y="${it.y + it.h/2}" fill="#ffffff" font-size="${Math.min(it.w, it.h) * 0.28}" font-weight="bold" text-anchor="middle" dominant-baseline="middle" style="text-shadow: 0 1px 2px rgba(0,0,0,0.8);">${it.name.toUpperCase()}</text>
                                    </g>
                                `;
                            }).join('')}

                        </svg>
                    </div>

                    <div>
                        <table style="width: 100%; border-collapse: collapse; background: #1f1f2b; border: 1px solid #2e2e3e; font-size: 11px;">
                            <thead>
                                <tr style="background: #282836; color: #8e8e9f; text-transform: uppercase;">
                                    <th style="padding: 8px; border: 1px solid #2e2e3e; text-align: left;">PIEZA</th>
                                    <th style="padding: 8px; border: 1px solid #2e2e3e; text-align: center;">CNT</th>
                                    <th style="padding: 8px; border: 1px solid #2e2e3e; text-align: right;">ANCHO</th>
                                    <th style="padding: 8px; border: 1px solid #2e2e3e; text-align: right;">LARGO</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${Object.values(summaryPartsMap).map(p => `
                                    <tr>
                                        <td style="padding: 8px; border: 1px solid #2e2e3e; font-weight: bold; color: #ffffff;">${p.name.toUpperCase()}</td>
                                        <td style="padding: 8px; border: 1px solid #2e2e3e; text-align: center; color: #c2c2d0;">${p.qty}</td>
                                        <td style="padding: 8px; border: 1px solid #2e2e3e; text-align: right; color: #c2c2d0;">${p.w}</td>
                                        <td style="padding: 8px; border: 1px solid #2e2e3e; text-align: right; color: #c2c2d0;">${p.h}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="font-size: 11px; line-height: 1.8; color: #c2c2d0; font-family: monospace;">
                        <div style="text-align: right; margin-bottom: 14px;">
                            <span style="color: #828292;">EFICIENCIA: </span>
                            <strong style="color: #e06b00; font-size: 13px;">${efficiency}%</strong>
                        </div>

                        <div style="font-weight: bold; color: #ffffff; margin-bottom: 8px;">${pName}</div>
                        
                        <div>CHAPA: ${sheetW} X ${sheetH}</div>
                        <div><strong style="color: #ffffff;">CANT: ${group.count}</strong></div>
                        
                        <div style="margin-top: 10px; color: #9e9ea6;">
                            SOBRANTES: 
                            ${remanenteA.h > 0 ? `<div>A - ${remanenteA.w} X ${remanenteA.h}</div>` : ''}
                            ${remanenteB.w > 0 && remanenteB.h > 0 ? `<div>B - ${remanenteB.w} X ${remanenteB.h}</div>` : ''}
                        </div>
                    </div>

                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    const printBtn = document.getElementById('btn-print-report');
    if (printBtn) {
        printBtn.addEventListener('click', () => window.print());
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await populateSavedProjectsDropdown();
    initRealtimeSync();
    renderTabs();
    loadActiveSheetForm();
    updateButtonStates();
    const selectElem = document.getElementById('saved-projects-select');
    if (selectElem) lastSelectedValue = selectElem.value;
});
