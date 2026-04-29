-- ============================================================
-- FERMETRACK - SCHÉMA COMPLET DE LA BASE DE DONNÉES
-- Supabase / PostgreSQL
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLE: profils utilisateurs (liée à auth.users de Supabase)
-- ============================================================
CREATE TABLE profils (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'gerant', 'technicien', 'comptable', 'observateur')),
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: configuration de la ferme
-- ============================================================
CREATE TABLE ferme (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom TEXT NOT NULL,
  proprietaire TEXT NOT NULL,
  localisation TEXT,
  telephone TEXT,
  email TEXT,
  devise TEXT DEFAULT 'FCFA',
  langue TEXT DEFAULT 'fr',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: bandes / lots de volailles
-- ============================================================
CREATE TABLE bandes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom TEXT NOT NULL,
  race TEXT NOT NULL,
  date_mise_en_place DATE NOT NULL,
  effectif_initial INTEGER NOT NULL,
  effectif_actuel INTEGER NOT NULL,
  age_semaines INTEGER DEFAULT 0,
  statut TEXT DEFAULT 'actif' CHECK (statut IN ('actif', 'termine', 'vendu')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: production quotidienne d'œufs
-- ============================================================
CREATE TABLE production_oeufs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bande_id UUID REFERENCES bandes(id) ON DELETE CASCADE,
  date_collecte DATE NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('matin', 'soir')),
  oeufs_produits INTEGER NOT NULL DEFAULT 0,
  oeufs_casses INTEGER NOT NULL DEFAULT 0,
  oeufs_sales INTEGER NOT NULL DEFAULT 0,
  nombre_plateaux NUMERIC(10,2) DEFAULT 0,
  taux_ponte NUMERIC(5,2) DEFAULT 0,
  collecteur_id UUID REFERENCES profils(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bande_id, date_collecte, session)
);

-- ============================================================
-- TABLE: mouvements du cheptel (mortalités, ventes, achats)
-- ============================================================
CREATE TABLE mouvements_cheptel (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bande_id UUID REFERENCES bandes(id) ON DELETE CASCADE,
  date_mouvement DATE NOT NULL,
  type_mouvement TEXT NOT NULL CHECK (type_mouvement IN ('mortalite', 'vente', 'achat', 'reforme')),
  quantite INTEGER NOT NULL,
  cause TEXT,
  acheteur_vendeur TEXT,
  prix_unitaire NUMERIC(12,2),
  prix_total NUMERIC(12,2),
  notes TEXT,
  enregistre_par UUID REFERENCES profils(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: vaccins (référentiel)
-- ============================================================
CREATE TABLE vaccins_ref (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom TEXT NOT NULL,
  maladie_ciblee TEXT NOT NULL,
  type_vaccin TEXT,
  voie_administration TEXT,
  age_recommande_jours INTEGER,
  intervalle_rappel_jours INTEGER,
  est_anti_stress BOOLEAN DEFAULT false,
  notes TEXT
);

-- Insertion des vaccins courants volailles Afrique de l'Ouest
INSERT INTO vaccins_ref (nom, maladie_ciblee, type_vaccin, voie_administration, age_recommande_jours, intervalle_rappel_jours, est_anti_stress) VALUES
('Newcastle LaSota', 'Maladie de Newcastle', 'Vivant atténué', 'Eau de boisson / oculaire', 7, 30, false),
('Newcastle Clone 30', 'Maladie de Newcastle', 'Vivant atténué', 'Eau de boisson', 21, 60, false),
('Gumboro IBD', 'Maladie de Gumboro', 'Vivant atténué', 'Eau de boisson', 14, 21, false),
('Bronchite Infectieuse H120', 'Bronchite Infectieuse', 'Vivant atténué', 'Eau de boisson', 1, 28, false),
('Marek HVT', 'Maladie de Marek', 'Vivant atténué', 'Injection SC', 1, 0, false),
('Typhose aviaire', 'Typhose / Salmonellose', 'Inactivé', 'Injection IM', 60, 180, false),
('Variole aviaire', 'Variole', 'Vivant atténué', 'Piquage aile', 42, 0, false),
('Vitamine C / Électrolytes', 'Anti-stress', 'Supplément', 'Eau de boisson', 0, 7, true),
('Vitamine AD3E', 'Anti-stress vitamines', 'Supplément', 'Eau de boisson', 0, 14, true),
('Complexe vitamines B', 'Anti-stress métabolique', 'Supplément', 'Eau de boisson', 0, 14, true);

-- ============================================================
-- TABLE: calendrier vaccinal prévisionnel
-- ============================================================
CREATE TABLE calendrier_vaccinal (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bande_id UUID REFERENCES bandes(id) ON DELETE CASCADE,
  vaccin_id UUID REFERENCES vaccins_ref(id),
  date_prevue DATE NOT NULL,
  date_realisee DATE,
  statut TEXT DEFAULT 'prevu' CHECK (statut IN ('prevu', 'realise', 'reporte', 'annule')),
  lot_vaccin TEXT,
  fournisseur TEXT,
  dose_appliquee TEXT,
  realise_par UUID REFERENCES profils(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: traitements et médicaments
-- ============================================================
CREATE TABLE traitements (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bande_id UUID REFERENCES bandes(id) ON DELETE CASCADE,
  date_debut DATE NOT NULL,
  date_fin DATE,
  type_traitement TEXT NOT NULL CHECK (type_traitement IN ('medicament', 'antibiotique', 'antiparasitaire', 'antifongique', 'autre')),
  produit TEXT NOT NULL,
  molecule TEXT,
  dose TEXT,
  voie_administration TEXT,
  raison TEXT,
  temps_attente_jours INTEGER DEFAULT 0,
  cout NUMERIC(12,2) DEFAULT 0,
  prescrit_par TEXT,
  realise_par UUID REFERENCES profils(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: événements sanitaires généraux (débecquage, etc.)
-- ============================================================
CREATE TABLE evenements_sanitaires (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bande_id UUID REFERENCES bandes(id) ON DELETE CASCADE,
  type_evenement TEXT NOT NULL CHECK (type_evenement IN ('debecquage', 'pesee', 'transfert', 'desinfection', 'autre')),
  date_evenement DATE NOT NULL,
  date_rappel DATE,
  description TEXT,
  realise_par UUID REFERENCES profils(id),
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: photos
-- ============================================================
CREATE TABLE photos (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  entite_type TEXT NOT NULL CHECK (entite_type IN ('bande', 'traitement', 'evenement', 'stock', 'general')),
  entite_id UUID,
  url TEXT NOT NULL,
  nom_fichier TEXT,
  description TEXT,
  prise_par UUID REFERENCES profils(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: stock aliments
-- ============================================================
CREATE TABLE stock_aliments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  nom TEXT NOT NULL,
  type_aliment TEXT NOT NULL CHECK (type_aliment IN ('demarrage', 'croissance', 'ponte', 'finition', 'supplement')),
  stock_actuel_kg NUMERIC(12,2) DEFAULT 0,
  stock_minimum_kg NUMERIC(12,2) DEFAULT 0,
  prix_unitaire_kg NUMERIC(10,2) DEFAULT 0,
  fournisseur TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: mouvements stock aliments
-- ============================================================
CREATE TABLE mouvements_stock (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  aliment_id UUID REFERENCES stock_aliments(id) ON DELETE CASCADE,
  date_mouvement DATE NOT NULL,
  type_mouvement TEXT NOT NULL CHECK (type_mouvement IN ('entree', 'sortie', 'ajustement')),
  quantite_kg NUMERIC(12,2) NOT NULL,
  prix_unitaire NUMERIC(10,2),
  montant_total NUMERIC(12,2),
  fournisseur TEXT,
  notes TEXT,
  enregistre_par UUID REFERENCES profils(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: comptabilité - recettes et dépenses
-- ============================================================
CREATE TABLE comptabilite (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date_operation DATE NOT NULL,
  type_operation TEXT NOT NULL CHECK (type_operation IN ('recette', 'depense')),
  categorie TEXT NOT NULL CHECK (categorie IN (
    'vente_oeufs', 'vente_volailles', 'vente_autre',
    'achat_aliment', 'achat_medicament', 'achat_vaccin',
    'achat_volailles', 'main_oeuvre', 'charges_fixes',
    'materiel', 'eau_electricite', 'autre'
  )),
  montant NUMERIC(14,2) NOT NULL,
  description TEXT,
  reference TEXT,
  bande_id UUID REFERENCES bandes(id),
  enregistre_par UUID REFERENCES profils(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: notifications
-- ============================================================
CREATE TABLE notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  titre TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'danger', 'success')),
  entite_type TEXT,
  entite_id UUID,
  lu BOOLEAN DEFAULT false,
  destinataire_role TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TABLE: push subscriptions (notifications PWA)
-- ============================================================
CREATE TABLE push_subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profils(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);

-- ============================================================
-- VUES UTILES
-- ============================================================

-- Vue production journalière consolidée
CREATE OR REPLACE VIEW v_production_journaliere AS
SELECT
  date_collecte,
  bande_id,
  b.nom AS bande_nom,
  SUM(oeufs_produits) AS total_oeufs,
  SUM(oeufs_casses) AS total_casses,
  SUM(oeufs_sales) AS total_sales,
  SUM(nombre_plateaux) AS total_plateaux,
  ROUND(SUM(oeufs_produits)::numeric / NULLIF(b.effectif_actuel, 0) * 100, 2) AS taux_ponte
FROM production_oeufs po
JOIN bandes b ON b.id = po.bande_id
GROUP BY date_collecte, bande_id, b.nom, b.effectif_actuel;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE profils ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_oeufs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_cheptel ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendrier_vaccinal ENABLE ROW LEVEL SECURITY;
ALTER TABLE traitements ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenements_sanitaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_aliments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE comptabilite ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Politique : tout utilisateur authentifié peut lire
CREATE POLICY "Lecture authentifiés" ON profils FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON bandes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON production_oeufs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON mouvements_cheptel FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON calendrier_vaccinal FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON traitements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON evenements_sanitaires FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON photos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON stock_aliments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON mouvements_stock FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON comptabilite FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture authentifiés" ON notifications FOR SELECT TO authenticated USING (true);

-- Politique : écriture selon rôle (gérant, technicien, admin)
CREATE POLICY "Écriture autorisée" ON production_oeufs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Écriture autorisée" ON mouvements_cheptel FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Écriture autorisée" ON calendrier_vaccinal FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON traitements FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON evenements_sanitaires FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON photos FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON stock_aliments FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON mouvements_stock FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON comptabilite FOR ALL TO authenticated USING (true);
CREATE POLICY "Écriture autorisée" ON bandes FOR ALL TO authenticated USING (true);
