import { useState, useEffect, useMemo } from 'react';
import {
  ShoppingBag, History, Users, Settings, Plus, Minus, Check, Trash2, RefreshCw, Download, Pencil, X,
  ChevronUp, ChevronDown, Eraser, Repeat, AlarmClock
} from 'lucide-react';
import type { ShoppingItem, SyncState, Product, AuditEvent, ProductCategory } from './types/database';
import {
  purchasesFromEvents, getRunningLow, getLastTrip, type PurchaseRecord
} from './features/insights/purchaseInsights';
import { INITIAL_CATALOG, FREQUENT_SUGGESTIONS, findCatalogProduct } from './features/products/catalog';
import { normalizeProductName } from './lib/normalizer';
import { fetchShoppingItems, atomicAddItem, updateItemStatus, updateItemQuantity } from './services/shoppingService';
import { subscribeToFamily, syncPendingOperations } from './features/sync/syncManager';
import { fetchAuditEvents, exportEventsToCSV } from './services/auditService';
import { isSupabaseConfigured } from './lib/supabase';
import { ProductIcon, resolveProductIcon, CUSTOM_ICON_KEYS } from './components/ProductIcon';

const MAIN_ITEMS_KEY = 'mercado-main-items';
const ICON_CHOICES = [
  // ícones desenhados para o app
  ...CUSTOM_ICON_KEYS,
  // geral
  '🛒', '📦', '🥫', '🫙',
  // café da manhã e padaria
  '☕', '🍞', '🥐', '🧈', '🥚', '🍯', '🥞',
  // geladeira
  '🥛', '🧀', '🧃', '🥤', '🧊', '🍦',
  // carnes e pratos
  '🥩', '🍗', '🥓', '🌭', '🐟', '🍝', '🍕',
  // hortifruti
  '🥗', '🥬', '🥕', '🥔', '🧅', '🧄', '🍋', '🍓', '🍉', '🍇', '🥑',
  // lanches
  '🍪', '🍫', '🥜', '🍿',
  // temperos
  '🧂', '🫒', '🌶️',
  // bebidas
  '💧', '🍺', '🍷',
  // limpeza e higiene
  '🧴', '🧼', '🧹', '🧻', '🪥',
];
const UNIT_CHOICES = ['unidade', 'kg', 'pacote', 'litro', 'dúzia', 'pote', 'frasco', 'caixa', 'maço', 'g', 'cabeça', 'tubo'];

// Ordem das seções pensando no caminho pelo mercado
const CATEGORY_LABELS: Record<ProductCategory, { label: string; icon: string }> = {
  hortifruti: { label: 'Hortifruti', icon: '🥬' },
  frutas: { label: 'Frutas', icon: '🍎' },
  padaria: { label: 'Padaria', icon: '🥖' },
  laticinios_refrigerados: { label: 'Laticínios e frios', icon: '🧀' },
  proteinas: { label: 'Carnes e peixes', icon: '🥩' },
  graos_basicos: { label: 'Mercearia', icon: '🍚' },
  limpeza: { label: 'Limpeza', icon: '🧽' },
  higiene_pessoal: { label: 'Higiene pessoal', icon: '🧼' },
  outros: { label: 'Outros', icon: '🛒' },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS) as ProductCategory[];

function loadMainItems(): Product[] {
  try {
    const raw = localStorage.getItem(MAIN_ITEMS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Product[];
    }
  } catch {
    // armazenamento indisponível ou corrompido: usa o padrão
  }
  return FREQUENT_SUGGESTIONS;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'list' | 'history' | 'family' | 'settings'>('list');
  const [familyName] = useState('Familia Silva');
  const [familyId] = useState('fam-123');
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [inputName, setInputName] = useState('');
  const [inputQty, setInputQty] = useState(1);
  const [inputUnit, setInputUnit] = useState('unidade');
  const [syncState, setSyncState] = useState<SyncState>('offline');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [removeItemModal, setRemoveItemModal] = useState<ShoppingItem | null>(null);
  const [removeReason, setRemoveReason] = useState('');
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [mainItems, setMainItems] = useState<Product[]>(loadMainItems);
  const [isEditingMainItems, setIsEditingMainItems] = useState(false);
  const [newMainName, setNewMainName] = useState('');
  const [newMainUnit, setNewMainUnit] = useState('unidade');
  const [newMainIcon, setNewMainIcon] = useState('🛒');
  // -2 = sugestões fechadas, -1 = abertas sem destaque, 0+ = sugestão destacada
  const [highlighted, setHighlighted] = useState(-1);
  const [purchaseEvents, setPurchaseEvents] = useState<AuditEvent[]>([]);

  function updateMainItems(next: Product[]) {
    setMainItems(next);
    try {
      localStorage.setItem(MAIN_ITEMS_KEY, JSON.stringify(next));
    } catch {
      // armazenamento indisponível: mantém só na memória
    }
  }

  function handleAddMainItem() {
    const name = newMainName.trim();
    if (!name) return;
    const norm = normalizeProductName(name);
    if (mainItems.some((p) => p.normalized_name === norm)) {
      showToast(`${name} já está nos itens principais.`);
      return;
    }
    const fromCatalog = findCatalogProduct(name);
    const product: Product = fromCatalog
      ? { ...fromCatalog, default_unit: newMainUnit }
      : {
          id: 'custom-' + norm.replace(/\s+/g, '-'),
          name,
          normalized_name: norm,
          icon: newMainIcon,
          category: 'outros',
          default_unit: newMainUnit,
          is_global: false,
          created_by: 'local',
        };
    updateMainItems([...mainItems, product]);
    setNewMainName('');
    showToast(`${product.name} adicionado aos itens principais!`);
  }

  function handleRemoveMainItem(id: string) {
    updateMainItems(mainItems.filter((p) => p.id !== id));
  }

  function handleMoveMainItem(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= mainItems.length) return;
    const next = [...mainItems];
    [next[index], next[target]] = [next[target], next[index]];
    updateMainItems(next);
  }

  /** Acha o produto conhecido (catálogo ou item principal do usuário) pelo id ou nome. */
  function findKnownProduct(normalizedName: string, productId?: string | null): Product | undefined {
    return (
      (productId ? INITIAL_CATALOG.find((p) => p.id === productId) : undefined) ||
      mainItems.find((p) => p.normalized_name === normalizedName) ||
      INITIAL_CATALOG.find((p) => p.normalized_name === normalizedName)
    );
  }

  function productForItem(item: ShoppingItem): Product | undefined {
    return item.product || findKnownProduct(item.normalized_name, item.product_id);
  }

  function productForRecord(rec: PurchaseRecord): Product {
    return (
      findKnownProduct(rec.normalized_name, rec.product_id) || {
        id: 'custom-' + rec.normalized_name.replace(/\s+/g, '-'),
        name: rec.name,
        normalized_name: rec.normalized_name,
        icon: '📦',
        category: 'outros',
        default_unit: rec.unit,
        is_global: false,
        created_by: 'local',
      }
    );
  }

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
      fetchAuditEvents(familyId, { action: 'item_purchased' }, 1, 1000)
        .then((res) => setPurchaseEvents(res.events))
        .catch(() => setPurchaseEvents([]));
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
        .catch(() => showToast('Erro ao carregar histórico.'))
        .finally(() => setIsLoadingHistory(false));
    }
  }, [activeTab, filterAction, familyId]);


  async function handleAddItem(product?: Product, customQty?: number) {
    const targetName = product ? product.name : inputName.trim();
    if (!targetName) return;

    const norm = normalizeProductName(targetName);
    const matched = product || INITIAL_CATALOG.find(p => p.normalized_name === norm);
    // Itens criados pelo usuário não existem na tabela de produtos: vão como nome livre
    const isCatalogProduct = Boolean(matched && !matched.id.startsWith('custom-'));
    const productId = isCatalogProduct ? matched!.id : null;
    const qty = customQty || Number(inputQty) || 1;
    const unit = product ? product.default_unit : inputUnit;

    try {
      await atomicAddItem(
        familyId,
        productId,
        isCatalogProduct ? null : (matched?.name || targetName),
        norm,
        qty,
        unit,
        matched
      );
      showToast(`${matched?.name || targetName} adicionado à lista!`);
      if (!product) {
        setInputName('');
        setInputQty(1);
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

  async function handleChangeQuantity(item: ShoppingItem, delta: number) {
    const next = item.quantity + delta;
    if (next < 1) return;
    // Atualiza na tela na hora; o salvamento vem logo depois
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: next } : i)));
    try {
      await updateItemQuantity(familyId, item.id, next);
    } catch (err: any) {
      showToast(err.message || 'Erro ao mudar a quantidade.');
    }
    await loadData();
  }

  async function handleClearPurchased() {
    if (!purchasedItems.length) return;
    const ok = window.confirm(`Limpar ${purchasedItems.length} item(ns) comprado(s)? Eles continuam no histórico.`);
    if (!ok) return;
    try {
      for (const item of purchasedItems) {
        await updateItemStatus(familyId, item.id, 'removed', 'Compra finalizada');
      }
      showToast('Comprados limpos!');
    } catch (err: any) {
      showToast(err.message || 'Erro ao limpar comprados.');
    }
    await loadData();
  }

  async function addRecord(rec: PurchaseRecord) {
    const product = productForRecord(rec);
    const isCatalogProduct = !product.id.startsWith('custom-');
    await atomicAddItem(
      familyId,
      isCatalogProduct ? product.id : null,
      isCatalogProduct ? null : product.name,
      rec.normalized_name,
      rec.quantity,
      rec.unit,
      product
    );
  }

  async function handleAddRecord(rec: PurchaseRecord) {
    try {
      await addRecord({ ...rec, quantity: 1 });
      showToast(`${rec.name} adicionado à lista!`);
    } catch (err: any) {
      showToast(err.message || 'Erro ao adicionar item.');
    }
    await loadData();
  }

  async function handleRepeatLastTrip() {
    const pendingNames = new Set(pendingItems.map((i) => i.normalized_name));
    const toAdd = lastTrip.filter((r) => !pendingNames.has(r.normalized_name));
    if (!toAdd.length) {
      showToast('Os itens da última compra já estão na lista.');
      return;
    }
    try {
      for (const rec of toAdd) await addRecord(rec);
      const skipped = lastTrip.length - toAdd.length;
      showToast(
        `${toAdd.length} item(ns) da última compra adicionados!` +
          (skipped ? ` ${skipped} já estava(m) na lista.` : '')
      );
    } catch (err: any) {
      showToast(err.message || 'Erro ao repetir a compra.');
    }
    await loadData();
  }

  function handlePickSuggestion(prod: Product) {
    handleAddItem(prod, Number(inputQty) || 1);
    setInputName('');
    setInputQty(1);
    setHighlighted(-1);
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && typeSuggestions.length) {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % typeSuggestions.length);
    } else if (e.key === 'ArrowUp' && typeSuggestions.length) {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? typeSuggestions.length - 1 : h - 1));
    } else if (e.key === 'Escape') {
      setHighlighted(-2);
    } else if (e.key === 'Enter') {
      if (highlighted >= 0 && typeSuggestions[highlighted]) {
        handlePickSuggestion(typeSuggestions[highlighted]);
      } else {
        handleAddItem();
      }
    }
  }

  const pendingItems = items.filter((i) => i.status === 'pending');
  const purchasedItems = items.filter((i) => i.status === 'purchased');

  const pendingGroups = useMemo(() => {
    const groups = new Map<ProductCategory, ShoppingItem[]>();
    for (const item of pendingItems) {
      const raw = productForItem(item)?.category;
      const category: ProductCategory = raw && raw in CATEGORY_LABELS ? raw : 'outros';
      groups.set(category, [...(groups.get(category) || []), item]);
    }
    return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      items: groups.get(c)!.sort((a, b) =>
        (a.product?.name || a.custom_name || '').localeCompare(b.product?.name || b.custom_name || '', 'pt-BR')
      ),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, mainItems]);

  const typeSuggestions = useMemo(() => {
    const query = normalizeProductName(inputName);
    if (query.length < 2) return [];
    const seen = new Set<string>();
    const pool = [...mainItems, ...INITIAL_CATALOG].filter((p) => {
      if (seen.has(p.normalized_name)) return false;
      seen.add(p.normalized_name);
      return true;
    });
    const starts = pool.filter((p) => p.normalized_name.startsWith(query));
    const wordStarts = pool.filter(
      (p) => !p.normalized_name.startsWith(query) && p.normalized_name.split(' ').some((w) => w.startsWith(query))
    );
    const contains = pool.filter(
      (p) => !starts.includes(p) && !wordStarts.includes(p) && p.normalized_name.includes(query)
    );
    return [...starts, ...wordStarts, ...contains].slice(0, 6);
  }, [inputName, mainItems]);

  const purchases = useMemo(() => purchasesFromEvents(purchaseEvents), [purchaseEvents]);
  const runningLow = useMemo(
    () => getRunningLow(purchases, new Set(pendingItems.map((i) => i.normalized_name))).slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchases, items]
  );
  const lastTrip = useMemo(() => getLastTrip(purchases), [purchases]);

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
            {activeTab === 'history' && 'Histórico de Atividades'}
            {activeTab === 'family' && 'Membros da Família'}
            {activeTab === 'settings' && 'Ajustes do Aplicativo'}
          </p>
        </div>
        <div className={`sync-pill ${syncState}`}>
          <RefreshCw size={12} className={syncState === 'syncing' ? 'spin' : ''} />
          <span>
            {syncState === 'synced' && 'Sincronizado'}
            {syncState === 'syncing' && 'Sincronizando...'}
            {syncState === 'offline' && 'Modo Offline'}
            {syncState === 'error' && 'Falha de Sincronia'}
          </span>
        </div>
      </header>

      <main className="main-content">
        {activeTab === 'list' && (
          <div>
            <div className="quick-add-container">
              <div className="autocomplete">
                <input
                  className="input"
                  type="text"
                  placeholder="O que está faltando em casa?"
                  value={inputName}
                  role="combobox"
                  aria-expanded={typeSuggestions.length > 0}
                  aria-autocomplete="list"
                  onChange={(e) => {
                    setInputName(e.target.value);
                    setHighlighted(-1);
                  }}
                  onKeyDown={handleInputKeyDown}
                  onBlur={() => setTimeout(() => setHighlighted(-2), 150)}
                  onFocus={() => setHighlighted(-1)}
                />
                {typeSuggestions.length > 0 && highlighted > -2 && (
                  <ul className="autocomplete-list" role="listbox">
                    {typeSuggestions.map((prod, idx) => (
                      <li
                        key={prod.id}
                        role="option"
                        aria-selected={idx === highlighted}
                        className={`autocomplete-option ${idx === highlighted ? 'active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handlePickSuggestion(prod);
                        }}
                      >
                        <ProductIcon className="autocomplete-icon" icon={resolveProductIcon(prod)} />
                        <span className="autocomplete-name">{prod.name}</span>
                        <span className="item-qty">{prod.default_unit}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <input
                className="user-input-qty"
                type="number"
                min="1"
                value={inputQty}
                onChange={(e) => setInputQty(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <select
                className="unit-select"
                value={inputUnit}
                onChange={(e) => setInputUnit(e.target.value)}
              >
                {UNIT_CHOICES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
              <button className="btn-primary" onClick={() => handleAddItem()}>
                <Plus size={18} />
                <span>Adicionar</span>
              </button>
            </div>

            <div className="section-heading main-items-heading">
              <span>Itens principais</span>
              <button className="link-button" onClick={() => setIsEditingMainItems(true)}>
                <Pencil size={13} />
                <span>Editar</span>
              </button>
            </div>
            <div className="suggestions-scroll">
              {mainItems.length === 0 && (
                <button className="suggestion-pill" onClick={() => setIsEditingMainItems(true)}>
                  <Plus size={14} />
                  <span>Adicionar itens principais</span>
                </button>
              )}
              {mainItems.map((prod) => (
                <button
                  key={prod.id}
                  className="suggestion-pill"
                  onClick={() => handleAddItem(prod, 1)}
                >
                  <ProductIcon icon={resolveProductIcon(prod)} />
                  <span>{prod.name}</span>
                </button>
              ))}
            </div>

            {(runningLow.length > 0 || lastTrip.length > 0) && (
              <div className="insights-card">
                {runningLow.length > 0 && (
                  <>
                    <div className="insights-title">
                      <AlarmClock size={16} />
                      <span>Está acabando?</span>
                    </div>
                    <p className="insights-hint">Vocês costumam comprar estes itens e já faz um tempo.</p>
                    <div className="suggestions-scroll">
                      {runningLow.map((s) => (
                        <button
                          key={s.normalized_name}
                          className="suggestion-pill running-low-pill"
                          title={`Costuma comprar a cada ${s.averageDays} dia(s)`}
                          onClick={() => handleAddRecord(s)}
                        >
                          <ProductIcon icon={resolveProductIcon(productForRecord(s))} />
                          <span>{s.name}</span>
                          <span className="running-low-days">há {s.daysSinceLast}d</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {lastTrip.length > 0 && (
                  <button className="btn-secondary repeat-button" onClick={handleRepeatLastTrip}>
                    <Repeat size={16} />
                    <span>Repetir última compra ({lastTrip.length} {lastTrip.length === 1 ? 'item' : 'itens'})</span>
                  </button>
                )}
              </div>
            )}

            <section>
              <div className="section-heading">Itens Pendentes ({pendingItems.length})</div>
              {pendingItems.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🛒</div>
                  <p>Tudo em dia! Nenhum produto pendente.</p>
                </div>
              ) : (
                pendingGroups.map((group) => (
                  <div key={group.category} className="category-group">
                    <div className="category-heading">
                      <span>{CATEGORY_LABELS[group.category].icon}</span>
                      <span>{CATEGORY_LABELS[group.category].label}</span>
                      <span className="category-count">{group.items.length}</span>
                    </div>
                    <div className="items-list">
                      {group.items.map((item) => (
                        <div key={item.id} className="item-card">
                          <div className="item-info" onClick={() => handleTogglePurchased(item)}>
                            <ProductIcon className="item-icon" icon={resolveProductIcon(productForItem(item))} />
                            <div>
                              <div className="item-name">{item.product?.name || item.custom_name}</div>
                              <div className="item-qty">{item.unit}</div>
                            </div>
                          </div>
                          <div className="item-actions">
                            <div className="qty-stepper" aria-label={`Quantidade de ${item.product?.name || item.custom_name}`}>
                              <button
                                className="qty-btn"
                                title="Diminuir"
                                disabled={item.quantity <= 1}
                                onClick={() => handleChangeQuantity(item, -1)}
                              >
                                <Minus size={14} />
                              </button>
                              <span className="qty-value">{item.quantity}</span>
                              <button className="qty-btn" title="Aumentar" onClick={() => handleChangeQuantity(item, 1)}>
                                <Plus size={14} />
                              </button>
                            </div>
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
                  </div>
                ))
              )}
            </section>

            {purchasedItems.length > 0 && (
              <section style={{ marginTop: '24px' }}>
                <div className="section-heading main-items-heading">
                  <span>Comprados ({purchasedItems.length})</span>
                  <button className="link-button" onClick={handleClearPurchased}>
                    <Eraser size={13} />
                    <span>Limpar comprados</span>
                  </button>
                </div>
                <div className="items-list">
                  {purchasedItems.map((item) => (
                    <div key={item.id} className="item-card purchased">
                      <div className="item-info" onClick={() => handleTogglePurchased(item)}>
                        <ProductIcon className="item-icon" icon={resolveProductIcon(productForItem(item))} />
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
                          title="Voltar para pendente"
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
                <option value="">Todas as ações</option>
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
                <p>Carregando histórico...</p>
              </div>
            ) : auditEvents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p>Nenhuma alteração registrada ainda.</p>
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
                        {ev.action === 'item_restored' && 'Voltou para pendente'}
                        {!['item_added', 'item_purchased', 'item_removed', 'quantity_changed', 'item_restored'].includes(ev.action) && ev.action}
                      </span>
                      <span>{new Date(ev.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div className="history-card-meta">
                      {ev.after_data?.product_name || ev.before_data?.product_name || 'Produto'} — Realizado por {ev.actor_name || 'Familiar'}
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
              <h3>Privacidade e Permissões</h3>
              <p>Todos os membros autorizados podem visualizar, adicionar e riscar produtos em tempo real.</p>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <div className="settings-card">
              <h3>Plano e Operação</h3>
              <p>Operando com <strong>Custo Zero (R$ 0,00/mês)</strong>.</p>
              <p style={{ marginTop: '6px' }}>
                Status do Supabase: {isSupabaseConfigured ? "Conectado" : "Modo Local"}
              </p>
            </div>
            <div className="settings-card">
              <h3>Instalação como Aplicativo (PWA)</h3>
              <p>Abra no navegador do seu smartphone (toque em <strong>"Adicionar à tela de início"</strong>, não precisa de lojas de aplicativos).</p>
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

      {isEditingMainItems && (
        <div className="modal-overlay" onClick={() => setIsEditingMainItems(false)}>
          <div className="modal-card main-items-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title-row">
              <h3>Itens principais</h3>
              <button className="btn-icon" title="Fechar" onClick={() => setIsEditingMainItems(false)}>
                <X size={18} />
              </button>
            </div>
            <p className="modal-hint">
              Os itens que a casa sempre compra. Um toque no item principal já coloca ele na lista.
            </p>

            <div className="main-items-form">
              <input
                className="input"
                type="text"
                placeholder="Nome do item (ex.: Granola)"
                value={newMainName}
                onChange={(e) => {
                  setNewMainName(e.target.value);
                  const match = findCatalogProduct(e.target.value);
                  if (match) setNewMainUnit(match.default_unit);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMainItem()}
              />
              <select className="unit-select" value={newMainUnit} onChange={(e) => setNewMainUnit(e.target.value)}>
                {UNIT_CHOICES.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            {!findCatalogProduct(newMainName) && (
              <div className="icon-picker" aria-label="Escolher ícone">
                {ICON_CHOICES.map((icon) => (
                  <button
                    key={icon}
                    className={`icon-choice ${newMainIcon === icon ? 'selected' : ''}`}
                    onClick={() => setNewMainIcon(icon)}
                  >
                    <ProductIcon icon={icon} />
                  </button>
                ))}
              </div>
            )}
            <button className="btn-primary full-width" onClick={handleAddMainItem}>
              <Plus size={18} />
              <span>Adicionar aos principais</span>
            </button>

            <div className="main-items-list">
              {mainItems.length === 0 && <p className="modal-hint">Nenhum item principal ainda.</p>}
              {mainItems.map((prod, index) => (
                <div key={prod.id} className="main-item-row">
                  <div className="reorder-buttons">
                    <button
                      className="reorder-btn"
                      title={`Subir ${prod.name}`}
                      disabled={index === 0}
                      onClick={() => handleMoveMainItem(index, -1)}
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      className="reorder-btn"
                      title={`Descer ${prod.name}`}
                      disabled={index === mainItems.length - 1}
                      onClick={() => handleMoveMainItem(index, 1)}
                    >
                      <ChevronDown size={16} />
                    </button>
                  </div>
                  <ProductIcon className="item-icon" icon={resolveProductIcon(prod)} />
                  <span className="main-item-name">{prod.name}</span>
                  <span className="item-qty">{prod.default_unit}</span>
                  <button className="btn-icon" title={`Remover ${prod.name}`} onClick={() => handleRemoveMainItem(prod.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => updateMainItems(FREQUENT_SUGGESTIONS)}>
                Restaurar padrão
              </button>
              <button className="btn-primary" onClick={() => setIsEditingMainItems(false)}>
                Pronto
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
          <span>Histórico</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'family' ? 'active' : ''}`}
          onClick={() => setActiveTab('family')}
        >
          <Users size={20} />
          <span>Família</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
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
