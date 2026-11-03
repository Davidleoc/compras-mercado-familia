import { useState, useEffect } from 'react';
import { 
  ShoppingBag, History, Users, Settings, Plus, Check, Trash2, RefreshCw, Download 
} from 'lucide-react';
import type { ShoppingItem, SyncState, Product, AuditEvent } from './types/database';
import { INITIAL_CATALOG, FREQUENT_SUGGESTIONS } from './features/products/catalog';
import { normalizeProductName } from './lib/normalizer';
import { fetchShoppingItems, atomicAddItem, updateItemStatus } from './services/shoppingService';
import { subscribeToFamily, syncPendingOperations } from './features/sync/syncManager';
import { fetchAuditEvents, exportEventsToCSV } from './services/auditService';
import { isSupabaseConfigured } from './lib/supabase';

export function App() {
  const [activeTab, setActiveTab] = useState<'list' | 'history' | 'family' | 'settings'>('list');
  const [familyName] = useState('Familia Silva');
  const [familyId] = useState('fam-123');
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inputName, setInputName] = useState('');
  const [inputQty, setIinputQty] = useState(1);
  const [inputUnit, setInputUnit] = useState('unidade');
  const [syncState, setSyncState] = useState<SyncState>('offline');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [removeItemModal, setRemoveItemModal] = useState<ShoppingItem | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3000);
  }

  async function loadData() {
    try {
      setSyncState('syncing');
      const data = await fetchShoppingItems(familyId);
      setItems(data);
      setSyncState(isSupabaseConfigured ? 'synced' : 'offline');
    } catch {
      setSyncState('error');
    }
  }

  useEffect(() => {
    loadData();
    const unsub = subscribeToFamily(familyId, () => {
      loadData();
    });

    const interval = setInterval(async () => {
      const synced = await syncPendingOperations();
      if (synced > 0) {
        showToast(synced + ' operacoes sincronizadas!');
        loadData();
      }
    }, 10000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [familyId]);

  useEffect(() => {
    if (activeTab === 'history') {
      setIsLoadingHistory(true);
      fetchAuditEvents(familyId, { action: filterAction || undefined })
        .then((res) => setAuditEvents(res.events))
        .catch(() => showToast('Erro ao carregar hist\u00f3rico.'))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [activeTab, filterAction, familyId]);


  async function handleAddItem(product?: Product, customQty?: number) {
    const targetName = product ? product.name : inputName.trim();
    if (!targetName) return;

    const norm = normalizeProductName(targetName);
    const matched = product || INITIAL_CATALOG.find(p => p.normalized_name === norm);
    const productId = matched ? matched.id : null;
    const qty = customQty || Number(inputQty) || 1;
    const unit = product ? product.default_unit : inputUnit;

    try {
      await atomicAddItem(familyId, productId, matched ? null : targetName, norm, qty, unit);
      showToast(`${targetName} adicionado \u00e0 lista!`);
      if (!product) {
        setInputName('');
        setIinputQty(1);
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao adicionar item.');
    }
  }

  async function handleTogglePurchased(item: ShoppingItem) {
    const nextStatus = item.status === 'purchased' ? 'pending' : 'purchased';
    try {
      await updateItemStatus(familyId, item.id, nextStatus);
      showToast(nextStatus === 'purchased' ? 'Marcado como comprado!' : 'Item restaurado para pendente.');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao atualizar.');
    }
  }

  async function confirmRemoveItem() {
    if (!removeItemModal) return;
    try {
      await updateItemStatus(familyId, removeItemModal.id, 'removed', removeReason);
      showToast('Item retirado da lista.');
      setRemoveItemModal(null);
      setRemoveReason('');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Erro ao retirar item.');
    }
  }

  function handleExportCSV() {
    if (!auditEvents.length) {
      showToast('Nenhum evento para exportar.');
      return;
    }
    const csv = exportEventsToCSV(auditEvents);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `historico-${familyId}-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const pendingItems = items.filter((i) => i.status === 'pending');
  const purchasedItems = items.filter((i) => i.status === 'purchased');

  return (
    <div className="app-container">
      {toastMessage && (
        <div className="toast-feedback" role="status">
          {toastMessage}
        </div>
      )}

      <header className="header">
        <div className="title-group">
          <h1>{familyName}</h1>
          <p>
            {activeTab === 'list' && `${pendingItems.length} item(ns) pendente(s)`}
            {activeTab === 'history' && 'Hist\u00f3rico de Atividades'}
            {activeTab === 'family' && 'Membros da Fam\u00edlia'}
            {activeTab === 'settings' && 'Ajustes do Aplicativo'}
          </p>
        </div>
        <div className={`sync-pill ${syncState}`}>
          <RefreshCw size={12} className={syncState === 'syncing' ? 'spin' : ''} />
          <span>
            {syncState === 'synced' && 'Sincronizado'}
            {syncState === 'syncing' && 'Sincronizando\there...'}
            {syncState === 'offline' && 'Modo Offline'}
            {syncState === 'error' && 'Falha de Sincronia'}
          </span>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'list' && (
          <div>
            <div className="quick-add-container">
              <input
                className="input"
                type="text"
                placeholder="O que est\u00e1 faltando em casa?"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
              />
              <input
                className="user-input-qty"
                type="number"
                min="1"
                value={inputQty}
                onChange={(e) => setIinputQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <select
                className="unit-select"
                value={inputUnit}
                onChange={(e) => setInputUnit(e.target.value)}
              >
                <option value="unidade">unidade</option>
                <option value="kg">kg</option>
                <option value="pacote">pacote</option>
                <option value="litro">litro</option>
                <option value="d\u00fazia">d\u00fazia</option>
              </select>
              <button className="btn-primary" onClick={() => handleAddItem()}>
                <Plus size={18} />
                <span>Adicionar</span>
              </button>
            </div>

            <div className="suggestions-scroll">
              {FREQUENT_SUGGESTIONS.map((prod) => (
                <button
                  key={prod.id}
                  className="suggestion-pill"
                  onClick={() => handleAddItem(prod, 1)}
                >
                  <span>{prod.icon}</span>
                  <span>{prod.name}</span>
                </button>
              ))}
            </div>

            <section>
              <div className="section-heading">Itens Pendentes ({pendingItems.length})</div>
              {pendingItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">\u1F6D2</div>
                  <p>Tudo em dia! Nenhum produto pendente.</p>
                </div>
              ) : (
                <div className="items-list">
                  {pendingItems.map((item) => (
                    <div key={item.id} className="item-card">
                      <div className="item-info" onClick={() => handleTogglePurchased(item)}>
                        <span className="item-icon">{item.product?.icon || '\u1F4E6'}</span>
                        <div>
                          <div className="item-name">{item.product?.name || item.custom_name}</div>
                          <div className="item-qty">
                            {item.quantity} {item.unit}
                          </div>
                        </div>
                      </div>
                      <div className="item-actions">
                        <button
                           className="btn-icon check"
                           title="Marcar como comprado"
                           onClick={() => handleTogglePurchased(item)}
                        >
                          <Check size={20} />
                        </button>
                        <button
                          className="btn-icon"
                           title="Retirar da lista"
                           onClick={() => setRemoveItemModal(item)}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {purchasedItems.length > 0 && (
              <section style={{ marginTop: '24px' }}>
                <div className="section-heading">Comprados Recentemente ({purchasedItems.length})</div>
                <div className="items-list">
                  {purchasedItems.map((item) => (
                    <div key={item.id} className="item-card purchased">
                      <div className="item-info" onClick={() => handleTogglePurchased(item)}>
                        <span className="item-icon">{item.product?.icon || '\u1F4E6'}</span>
                        <div>
                          <div className="item-name">{item.product?.name || item.custom_name}</div>
                          <div className="item-qty">
                            {item.quantity} {item.unit}
                          </div>
                        </div>
                      </div>
                      <div className="item-actions">
                        <button
                          className="btn-icon"
                           title="Restaurar item"
                           onClick={() => handleTogglePurchased(item)}
                        >
                          <RefreshCw size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <select
                className="unit-select"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="">Todas as a\u00e7\u00f5es</option>
                <option value="item_added">Item adicionado</option>
                <option value="quantity_changed">Quantidade alterada</option>
                <option value="item_purchased">Item comprado</option>
                <option value="item_removed">Item retirado</option>
              </select>
              <button className="btn-secondary" onClick={handleExportCSV}>
                <Download size={16} />
                <span>Exportar CSV</span>
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="empty-state">
                <p>Carregando hist\u00f3rico...</p>
              </div>
            ) : auditEvents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">\u1F4CB</div>
                <p>Nenhuma altera\u00e7\u00e3o registrada ainda.</p>
              </div>
            ) : (
              <div>
                {auditEvents.map((ev) => (
                  <div key={ev.id} className="history-card">
                    <div className="history-card-header">
                      <span>
                        {ev.action === 'item_added' && 'Adicionou item'}
                        {ev.action === 'item_purchased' && 'Comprou item'}
                        {ev.action === 'item_removed' && 'Retirou item'}
                        {ev.action === 'quantity_changed' && 'Alterou quantidade'}
                        {!['item_added', 'item_purchased', 'item_removed', 'quantity_changed'].includes(ev.action) && ev.action}
                      </span>
                      <span>{new Date(ev.created_at).toLocaleTimeString('tt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="history-card-meta">
                      {ev.after_data?.product_name || ev.before_data?.product_name || 'Produto'} \u2014 Realizado por {ev.actor_name || 'Familiar'}
                      {ev.reason && <div>Motivo: {ev.reason}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'family' && (
          <div>
            <div className="settings-card">
              <h3>Membros da Casa</h3>
              <p>Compartilhe o link de convite abaixo com seus familiares para sincronizarem em tempo real com custo zero.</p>
              <div style={{ marginTop: '12px', padding: '10px', background: '#e2e8f0', borderRadius: '8px', fontSize: '13px', wordBreak: 'break-all' }}>
                https://mercado-em-familia.app/invite#token=convite-demo-gratuito
              </div>
            </div>
            <div className="settings-card">
              <h3>Privacidade ePermiss\u00f5es</h3>
              <p>Todos os membros autorizados podem visualizar, adicionar e riscar produtos em tempo real.</p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div className="settings-card">
              <h3>Plano e Opera\u00e7\u00e3o</h3>
              <p>Operando com <strong>Custo Zero (RS\u00a00,00/m\u00es)</strong>.</p>
              <p style={{ marginTop: '6px' }}>
                Status do Supabase: {isSupabaseConfigured ? "Conectado" : "Modo Local"}
              </p>
            </div>
            <div className="settings-card">
              <h3>Instala\u00e7\u00e3o como Aplicativo (PWA)</h3>
              <p>Abra no navegador do seu smartphone (toque em <strong>"Adicionar \u00e0 tela de in\u00edcio"</strong>,\nn\u00e2o precisa de lojas de aplicativos).</p>
            </div>
          </div>
        )}
      </main>
      {removeItemModal && (
        <div className="modal-overlay" onClick={() => setRemoveItemModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>Retirar da Lista</h3>
            <p style={{ margin: "0 0 12px 0", color: "#64748b", fontSize: "14px" }}>
              Deseja retirar <strong>{removeItemModal.product?.name || removeItemModal.custom_name}</strong>?
            </p>
            <input
              className="input"
              style={{ width: "100%", marginBottom: "12px" }}
              type="text"
              placeholder="Motivo opcional"
              value={removeReason}
              onChange={(e) => setRemoveReason(e.target.value)}
            />
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setRemoveItemModal(null)}>
                Cancelar
              </button>
              <button className="btn-danger" onClick={confirmRemoveItem}>
                Confirmar Retirada
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'list' ? 'active' : ''}`}
          onClick={() => setActiveTab('list')}
        >
          <ShoppingBag size={20} />
          <span>Lista</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <History size={20} />
          <span>Hist\u00f3rico</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'family' ? 'active' : ''}`}
          onClick={() => setActiveTab('family')}
        >
          <Users size={20} />
          <span>Fam\u00edlia</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={20} />
          <span>Ajustes</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
