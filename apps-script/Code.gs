/**
 * GymPro — Backend Google Apps Script Web App
 * Synchronisation bidirectionnelle hors ligne <-> Google Sheets
 * Résolution de conflits : "dernière modification gagne" (updated_at)
 */

// Définir la clé secrète ici ou via Propriétés du script (Propriété : GYMPRO_SECRET_KEY)
const DEFAULT_SECRET_KEY = 'GYMPRO-CLE-SECRETE-A-CHANGER';

// Définition exacte des 16 feuilles et de leurs colonnes
const SHEETS_SCHEMA = {
  Membres: [
    'id', 'code_membre', 'nom', 'prenom', 'sexe', 'date_naissance',
    'telephone', 'email', 'adresse', 'photo', 'contact_urgence_nom',
    'contact_urgence_tel', 'objectif', 'notes_sante', 'date_inscription',
    'statut', 'created_at', 'updated_at', 'deleted'
  ],
  Forfaits: [
    'id', 'nom', 'duree_jours', 'prix', 'devise', 'nb_seances_max',
    'actif', 'created_at', 'updated_at', 'deleted'
  ],
  Abonnements: [
    'id', 'membre_id', 'forfait_id', 'date_debut', 'date_fin',
    'prix_applique', 'statut', 'created_at', 'updated_at', 'deleted'
  ],
  Paiements: [
    'id', 'membre_id', 'abonnement_id', 'date', 'montant', 'devise',
    'mode', 'reference', 'note', 'recu_numero', 'created_at', 'updated_at', 'deleted'
  ],
  Presences: [
    'id', 'membre_id', 'date', 'heure_entree', 'heure_sortie', 'methode',
    'created_at', 'updated_at', 'deleted'
  ],
  Coachs: [
    'id', 'nom', 'prenom', 'telephone', 'specialite', 'salaire_base',
    'date_embauche', 'actif', 'created_at', 'updated_at', 'deleted'
  ],
  Cours: [
    'id', 'titre', 'coach_id', 'jour_semaine', 'heure_debut', 'heure_fin',
    'capacite', 'salle', 'created_at', 'updated_at', 'deleted'
  ],
  Reservations: [
    'id', 'cours_id', 'membre_id', 'date_cours', 'statut',
    'created_at', 'updated_at', 'deleted'
  ],
  Equipements: [
    'id', 'nom', 'categorie', 'quantite', 'etat', 'date_achat',
    'derniere_maintenance', 'prochaine_maintenance', 'created_at', 'updated_at', 'deleted'
  ],
  Produits: [
    'id', 'nom', 'categorie', 'prix_vente', 'stock', 'seuil_alerte',
    'created_at', 'updated_at', 'deleted'
  ],
  Ventes: [
    'id', 'date', 'membre_id', 'produit_id', 'quantite', 'prix_unitaire',
    'total', 'mode_paiement', 'created_at', 'updated_at', 'deleted'
  ],
  Depenses: [
    'id', 'date', 'categorie', 'description', 'montant', 'devise',
    'created_at', 'updated_at', 'deleted'
  ],
  Mesures: [
    'id', 'membre_id', 'date', 'poids', 'taille', 'imc', 'tour_taille',
    'tour_poitrine', 'tour_bras', 'notes', 'created_at', 'updated_at', 'deleted'
  ],
  Utilisateurs: [
    'id', 'nom_utilisateur', 'mot_de_passe_hash', 'role', 'actif',
    'created_at', 'updated_at', 'deleted'
  ],
  Parametres: [
    'id', 'cle', 'valeur', 'created_at', 'updated_at', 'deleted'
  ],
  Journal: [
    'id', 'date_heure', 'utilisateur', 'action', 'details',
    'created_at', 'updated_at', 'deleted'
  ]
};

function getConfiguredKey_() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty('GYMPRO_SECRET_KEY') || DEFAULT_SECRET_KEY;
}

function verifyKey_(providedKey) {
  return String(providedKey || '').trim() === String(getConfiguredKey_()).trim();
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Crée la feuille et ses en-têtes si elle n'existe pas encore
 */
function ensureSheet_(ss, tableName) {
  const headers = SHEETS_SCHEMA[tableName];
  if (!headers) {
    throw new Error('Table inconnue : ' + tableName);
  }
  let sheet = ss.getSheetByName(tableName);
  if (!sheet) {
    sheet = ss.insertSheet(tableName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return { sheet: sheet, headers: headers };
}

/**
 * Initialise toutes les feuilles du classeur
 */
function initAllSheets_(ss) {
  Object.keys(SHEETS_SCHEMA).forEach(function (name) {
    ensureSheet_(ss, name);
  });
}

/**
 * Lit toutes les lignes d'une feuille sous forme d'objets JSON
 */
function readSheetRows_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, idx) {
      let val = row[idx];
      if (val instanceof Date) {
        val = val.toISOString();
      }
      obj[h] = val;
    });
    return obj;
  });
}

/**
 * Endpoint GET : ping de connexion ou récupération des données (?action=ping|pull&key=...)
 */
function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    if (!verifyKey_(params.key)) {
      return jsonResponse_({ ok: false, error: 'Clé secrète invalide.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const action = params.action || 'ping';

    if (action === 'ping') {
      initAllSheets_(ss);
      return jsonResponse_({
        ok: true,
        message: 'Connexion GymPro réussie.',
        spreadsheetName: ss.getName(),
        serverTime: new Date().toISOString()
      });
    }

    if (action === 'pull') {
      initAllSheets_(ss);
      const table = params.table;
      const data = {};
      const tables = table && SHEETS_SCHEMA[table] ? [table] : Object.keys(SHEETS_SCHEMA);
      tables.forEach(function (name) {
        const ref = ensureSheet_(ss, name);
        data[name] = readSheetRows_(ref.sheet, ref.headers);
      });
      return jsonResponse_({
        ok: true,
        serverTime: new Date().toISOString(),
        data: data
      });
    }

    return jsonResponse_({ ok: false, error: 'Action GET inconnue.' });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/**
 * Endpoint POST : synchronisation par lot ou unitaire (upsert / delete logique)
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    const rawBody = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    const body = JSON.parse(rawBody);

    if (!verifyKey_(body.key)) {
      return jsonResponse_({ ok: false, error: 'Clé secrète invalide.' });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === 'ping') {
      initAllSheets_(ss);
      return jsonResponse_({
        ok: true,
        message: 'Connexion GymPro réussie.',
        spreadsheetName: ss.getName(),
        serverTime: new Date().toISOString()
      });
    }

    if (body.action === 'send_email') {
      const recipient = String(body.to || '').trim();
      const subject = String(body.subject || 'Notification GymPro').trim();
      const textBody = String(body.textBody || body.body || '').trim();
      const htmlBody = String(body.htmlBody || '').trim();
      if (!recipient) {
        return jsonResponse_({ ok: false, error: 'Adresse email destinataire manquante.' });
      }
      MailApp.sendEmail({
        to: recipient,
        subject: subject,
        body: textBody || subject,
        htmlBody: htmlBody || undefined
      });
      return jsonResponse_({
        ok: true,
        channel: 'apps_script',
        to: recipient,
        serverTime: new Date().toISOString()
      });
    }

    // Traitement d'une file de opérations [{ id, table, action, payload }]
    const singleRecord = body.payload || body.record;
    const operations = Array.isArray(body.operations)
      ? body.operations
      : (body.table && singleRecord ? [{ table: body.table, action: body.op || body.action || 'upsert', payload: singleRecord }] : []);

    const results = [];
    const grouped = {};
    operations.forEach(function (op) {
      if (!SHEETS_SCHEMA[op.table]) {
        results.push({ id: op.id || null, ok: false, error: 'Table inconnue: ' + op.table });
        return;
      }
      if (!grouped[op.table]) grouped[op.table] = [];
      grouped[op.table].push(op);
    });

    Object.keys(grouped).forEach(function (tableName) {
      const ref = ensureSheet_(ss, tableName);
      const sheet = ref.sheet;
      const headers = ref.headers;
      const keyField = tableName === 'Parametres' ? 'cle' : 'id';
      const keyColIdx = headers.indexOf(keyField);
      const updatedColIdx = headers.indexOf('updated_at');
      const deletedColIdx = headers.indexOf('deleted');

      const lastRow = sheet.getLastRow();
      const existingMap = {};
      if (lastRow > 1) {
        const existingValues = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
        existingValues.forEach(function (row, i) {
          const rowKey = String(row[keyColIdx] || '');
          if (rowKey) {
            existingMap[rowKey] = {
              rowIndex: i + 2,
              updatedAt: String(row[updatedColIdx] || ''),
              values: row
            };
          }
        });
      }

      grouped[tableName].forEach(function (op) {
        const payload = op.payload || {};
        const recordKey = String(payload[keyField] || payload.id || '');
        if (!recordKey) {
          results.push({ id: op.id || null, ok: false, error: 'Identifiant manquant.' });
          return;
        }

        const incomingUpdated = String(payload.updated_at || new Date().toISOString());
        const existing = existingMap[recordKey];

        // Résolution de conflit : dernière modification gagne (updated_at)
        if (existing && existing.updatedAt && incomingUpdated < existing.updatedAt) {
          results.push({
            id: op.id || recordKey,
            ok: true,
            status: 'skipped_older',
            serverUpdatedAt: existing.updatedAt
          });
          return;
        }

        const rowValues = headers.map(function (h, idx) {
          if (op.action === 'delete' && idx === deletedColIdx) return 1;
          if (h === 'deleted') return payload.deleted ? 1 : 0;
          const val = payload[h];
          return val === undefined || val === null ? '' : val;
        });

        if (existing) {
          sheet.getRange(existing.rowIndex, 1, 1, headers.length).setValues([rowValues]);
          existing.updatedAt = incomingUpdated;
        } else {
          sheet.appendRow(rowValues);
          existingMap[recordKey] = {
            rowIndex: sheet.getLastRow(),
            updatedAt: incomingUpdated,
            values: rowValues
          };
        }

        results.push({ id: op.id || recordKey, ok: true, status: 'applied' });
      });
    });

    return jsonResponse_({
      ok: true,
      appliedCount: results.filter(function (r) { return r.ok; }).length,
      results: results,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (_e) {}
  }
}
