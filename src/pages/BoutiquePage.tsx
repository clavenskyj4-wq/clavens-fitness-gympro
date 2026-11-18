import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '../components/MaterialIcon';
import { ConfirmModal, EmptyState, Modal } from '../components/ui';
import { SessionUser } from '../lib/auth';
import { getAllRecords, logAction, saveRecord, softDeleteRecord } from '../lib/db';
import { formatDateFR, formatMoney, todayISO } from '../lib/utils';
import { GymConfig, Membre, ModePaiement, Produit, Vente } from '../types/gym';

interface BoutiquePageProps {
  user: SessionUser;
  config: GymConfig;
  refreshTick: number;
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const BoutiquePage: React.FC<BoutiquePageProps> = ({
  user,
  config,
  refreshTick,
  onNotify,
}) => {
  const [produits, setProduits] = useState<Produit[]>([]);
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [membres, setMembres] = useState<Membre[]>([]);

  const [cart, setCart] = useState<{ produit: Produit; qty: number }[]>([]);
  const [saleMembreId, setSaleMembreId] = useState('');
  const [saleMode, setSaleMode] = useState<ModePaiement>('espèces');

  const [prodModalOpen, setProdModalOpen] = useState(false);
  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [deleteProdTarget, setDeleteProdTarget] = useState<Produit | null>(null);
  const [prodForm, setProdForm] = useState<Partial<Produit>>({
    nom: '',
    categorie: 'boissons',
    prix_vente: 100,
    stock: 20,
    seuil_alerte: 5,
  });

  const loadData = async () => {
    const [p, v, m] = await Promise.all([
      getAllRecords<Produit>('Produits'),
      getAllRecords<Vente>('Ventes'),
      getAllRecords<Membre>('Membres'),
    ]);
    setProduits(p);
    setVentes(v.sort((x, y) => y.created_at.localeCompare(x.created_at)));
    setMembres(m);
  };

  useEffect(() => {
    loadData();
  }, [refreshTick]);

  const addToCart = (prod: Produit) => {
    if (prod.stock <= 0) {
      onNotify('error', `Rupture de stock pour ${prod.nom}.`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((i) => i.produit.id === prod.id);
      if (existing) {
        if (existing.qty >= prod.stock) {
          onNotify('error', 'Stock insuffisant.');
          return prev;
        }
        return prev.map((i) => (i.produit.id === prod.id ? { ...i, qty: i.qty + 1 } : i));
      }
      return [...prev, { produit: prod, qty: 1 }];
    });
  };

  const cartTotal = cart.reduce((acc, item) => acc + item.produit.prix_vente * item.qty, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    for (const item of cart) {
      await saveRecord<Vente>('Ventes', {
        date: todayISO(),
        membre_id: saleMembreId,
        produit_id: item.produit.id,
        quantite: item.qty,
        prix_unitaire: item.produit.prix_vente,
        total: item.produit.prix_vente * item.qty,
        mode_paiement: saleMode,
      });
      await saveRecord<Produit>('Produits', {
        ...item.produit,
        stock: Math.max(0, item.produit.stock - item.qty),
      });
    }
    await logAction(
      user.nom_utilisateur,
      'Vente Boutique',
      `${cart.length} article(s) — Total ${formatMoney(cartTotal, config.devise_defaut)}`
    );
    setCart([]);
    await loadData();
    onNotify('success', 'Vente encaissée et stock mis à jour.');
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prodForm.nom?.trim()) return;
    await saveRecord<Produit>('Produits', {
      ...prodForm,
      id: editProdId || undefined,
      prix_vente: Number(prodForm.prix_vente || 0),
      stock: Number(prodForm.stock || 0),
      seuil_alerte: Number(prodForm.seuil_alerte || 5),
    });
    setProdModalOpen(false);
    await loadData();
    onNotify('success', 'Produit enregistré.');
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Boutique POS & Stock
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vente rapide de boissons, suppléments et accessoires · Déduction automatique du stock
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditProdId(null);
            setProdForm({
              nom: '',
              categorie: 'boissons',
              prix_vente: 100,
              stock: 20,
              seuil_alerte: 5,
            });
            setProdModalOpen(true);
          }}
          title="Créer un nouveau produit dans le catalogue"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold self-start sm:self-auto"
        >
          <MaterialIcon name="add" className="w-4 h-4" />
          Ajouter un produit
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Catalogue produits */}
        <div className="lg:col-span-8 space-y-4">
          {produits.length === 0 ? (
            <EmptyState
              icon="inventory_2"
              title="Aucun produit en boutique"
              description="Ajoutez vos boissons, protéines ou accessoires pour utiliser la caisse POS."
              actionLabel="Créer un produit"
              onAction={() => setProdModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {produits.map((p) => {
                const low = p.stock <= p.seuil_alerte;
                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs capitalize text-slate-500">{p.categorie}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditProdId(p.id);
                              setProdForm(p);
                              setProdModalOpen(true);
                            }}
                            title="Modifier ce produit"
                            className="p-1 text-slate-400 hover:text-orange-500"
                          >
                            <MaterialIcon name="edit" className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteProdTarget(p)}
                            title="Supprimer ce produit"
                            className="p-1 text-slate-400 hover:text-red-500"
                          >
                            <MaterialIcon name="delete" className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h3 className="font-semibold text-base text-slate-900 dark:text-white mt-1">
                        {p.nom}
                      </h3>
                      <p className="font-mono-num text-lg font-bold text-orange-600 dark:text-orange-400 mt-1">
                        {formatMoney(p.prix_vente, 'HTG')}
                      </p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#262b38]">
                      <span
                        className={`font-mono-num text-xs font-semibold ${
                          low ? 'text-red-600 dark:text-red-400' : 'text-slate-500'
                        }`}
                      >
                        Stock : {p.stock}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(p)}
                        disabled={p.stock <= 0}
                        title={p.stock <= 0 ? 'Produit en rupture de stock' : `Ajouter ${p.nom} au ticket`}
                        className="px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-40 text-white text-xs font-semibold"
                      >
                        Ajouter
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panier POS */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] h-fit space-y-4">
          <h2 className="font-display font-semibold text-base text-slate-900 dark:text-white flex items-center gap-2">
            <MaterialIcon name="point_of_sale" className="w-5 h-5 text-orange-500" />
            Ticket de caisse
          </h2>

          {cart.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">
              Cliquez sur un produit pour l’ajouter au panier.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-[#262b38]">
              {cart.map((item) => (
                <div key={item.produit.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{item.produit.nom}</p>
                    <p className="font-mono-num text-xs text-slate-500">
                      {item.qty} × {formatMoney(item.produit.prix_vente, 'HTG')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-num font-semibold">
                      {formatMoney(item.qty * item.produit.prix_vente, 'HTG')}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => prev.filter((x) => x.produit.id !== item.produit.id))
                      }
                      title={`Retirer ${item.produit.nom} du panier`}
                      className="text-red-500 p-1"
                    >
                      <MaterialIcon name="close" className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-[#262b38]">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Membre (optionnel)
              </label>
              <select
                value={saleMembreId}
                onChange={(e) => setSaleMembreId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="">Client de passage</option>
                {membres.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.prenom} {m.nom} ({m.code_membre})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Mode de paiement
              </label>
              <select
                value={saleMode}
                onChange={(e) => setSaleMode(e.target.value as ModePaiement)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="espèces">Espèces</option>
                <option value="MonCash">MonCash</option>
                <option value="NatCash">NatCash</option>
                <option value="carte">Carte</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-base font-bold pt-2">
              <span>Total</span>
              <span className="font-mono-num text-orange-600 dark:text-orange-400">
                {formatMoney(cartTotal, 'HTG')}
              </span>
            </div>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={handleCheckout}
              title="Valider la vente et déduire les quantités du stock"
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
            >
              Encaisser la vente
            </button>
          </div>
        </div>
      </div>

      {/* Dernières ventes */}
      {ventes.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-[#151821] border border-slate-200 dark:border-[#262b38] overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#262b38] font-semibold text-sm">
            Historique des ventes récentes
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#262b38] text-xs text-slate-500">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4">Produit</th>
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-4">Qté</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-[#262b38]">
                {ventes.slice(0, 20).map((v) => {
                  const prod = produits.find((p) => p.id === v.produit_id);
                  const mem = membres.find((m) => m.id === v.membre_id);
                  return (
                    <tr key={v.id}>
                      <td className="py-2.5 px-4 font-mono-num text-xs">{formatDateFR(v.date)}</td>
                      <td className="py-2.5 px-4">{prod?.nom || 'Produit'}</td>
                      <td className="py-2.5 px-4 text-xs text-slate-500">
                        {mem ? `${mem.prenom} ${mem.nom}` : 'Passage'}
                      </td>
                      <td className="py-2.5 px-4 font-mono-num">{v.quantite}</td>
                      <td className="py-2.5 px-4 text-xs">{v.mode_paiement}</td>
                      <td className="py-2.5 px-4 text-right font-mono-num font-semibold">
                        {formatMoney(v.total, 'HTG')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modale Produit */}
      <Modal
        open={prodModalOpen}
        onClose={() => setProdModalOpen(false)}
        title={editProdId ? 'Modifier le produit' : 'Nouveau produit'}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Nom *</label>
            <input
              type="text"
              required
              value={prodForm.nom || ''}
              onChange={(e) => setProdForm({ ...prodForm, nom: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Catégorie</label>
              <select
                value={prodForm.categorie || 'boissons'}
                onChange={(e) =>
                  setProdForm({ ...prodForm, categorie: e.target.value as Produit['categorie'] })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm"
              >
                <option value="boissons">Boissons</option>
                <option value="suppléments">Suppléments</option>
                <option value="accessoires">Accessoires</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Prix de vente (HTG)
              </label>
              <input
                type="number"
                min={0}
                required
                value={prodForm.prix_vente || 0}
                onChange={(e) => setProdForm({ ...prodForm, prix_vente: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Stock actuel</label>
              <input
                type="number"
                min={0}
                required
                value={prodForm.stock || 0}
                onChange={(e) => setProdForm({ ...prodForm, stock: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Seuil d’alerte
              </label>
              <input
                type="number"
                min={0}
                required
                value={prodForm.seuil_alerte || 5}
                onChange={(e) => setProdForm({ ...prodForm, seuil_alerte: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#0d0f14] border border-slate-300 dark:border-[#262b38] text-sm font-mono-num"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setProdModalOpen(false)}
              title="Annuler et fermer"
              className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              title="Enregistrer le produit en base locale"
              className="px-5 py-2 rounded-xl bg-orange-600 text-white text-sm font-semibold"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteProdTarget)}
        onClose={() => setDeleteProdTarget(null)}
        onConfirm={async () => {
          if (!deleteProdTarget) return;
          await softDeleteRecord('Produits', deleteProdTarget.id);
          await logAction(user.nom_utilisateur, 'Suppression produit', deleteProdTarget.nom);
          await loadData();
          onNotify('info', `Produit "${deleteProdTarget.nom}" supprimé.`);
        }}
        title="Supprimer ce produit ?"
        message={
          deleteProdTarget
            ? `Confirmez-vous la suppression du produit "${deleteProdTarget.nom}" du catalogue ?`
            : ''
        }
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
};
