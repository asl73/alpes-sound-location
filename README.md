# Site Alpes & Sound Location

Site de location de sonorisation et d’éclairage : catalogue, packs, réservation en ligne selon les disponibilités avec paiement immédiat de l’acompte, espace client et espace d’administration.

Pour mettre le site en ligne, suivez **[DEPLOIEMENT.md](DEPLOIEMENT.md)**.

## Ce que fait le site

**Côté client**
- Catalogue du matériel et des packs, avec fiches techniques et prix 24 h / week-end.
- Pack sur mesure (`/packs/sur-mesure`) : conseil de sono selon le nombre d’invités, choix article par article, remise automatique dès 3 articles différents loués à l’unité (10 % par défaut, réglable dans Paramètres, recalculée par la base de données).
- Choix des dates (forfait 24 h, week-end, ou durée sur mesure) et affichage des disponibilités réelles.
- Réservation en 5 étapes : dates, matériel, livraison (zones, installation, technicien), événement, paiement par carte (Stripe) de l’acompte de 30 % ou de la totalité, au choix du client.
- Espace client : suivi des réservations et des demandes de devis, paiement (acompte ou totalité), annulation tant que rien n’est payé.

**Côté administration** (`/admin`)
- Tableau de bord : devis à faire, acomptes attendus, prochains événements, chiffre d’affaires de l’année et plafond annuel.
- Fiche de chaque réservation : prix ajustables ligne par ligne, remise, acompte personnalisé, message au client, alerte en cas de conflit de stock.
- Devis (durée sur mesure, livraison sur devis, article sur demande) envoyé en un clic : le client reçoit un e-mail avec le lien de paiement.
- Planning mensuel avec les indisponibilités : bloquer un article ou tout le matériel sur des dates (usage personnel, réparation, location prise par téléphone).
- Gestion du matériel (prix, stock, photos, visibilité), des packs, des zones de livraison et des prestations.
- Galerie « Nos installations » de l’accueil : ajout de photos, légendes, ordre et grandes vignettes.
- Clients, messages du formulaire de contact, paramètres (coordonnées, acompte, caution, textes des conditions).

**Fonctionnement d’une réservation**
1. Le client choisit ses dates et son matériel : seules les disponibilités réelles lui sont proposées (réservations en cours et indisponibilités du planning déduites).
2. Il paie en ligne l’acompte de 30 % ou la totalité, au choix : le matériel lui est réservé une heure le temps du paiement (délai renouvelable trois fois si le matériel est toujours libre), puis la réservation est confirmée automatiquement. Vous recevez un e-mail.
3. Solde, caution et fin de location se notent depuis la fiche de la réservation.

Un paiement qui ne peut plus confirmer la réservation (réservation annulée ou déjà réglée, délai dépassé et matériel repris entre-temps) est remboursé automatiquement par Stripe ; le client et vous êtes prévenus par e-mail. Si le remboursement automatique échoue, le tableau de bord l’affiche jusqu’à ce que vous le fassiez depuis Stripe.

Une durée sur mesure, une livraison sur devis (stations) ou un article loué sur demande (XDJ-RR) passent par un devis : vous fixez le prix dans l’administration, le client reçoit un e-mail et paie l’acompte en ligne ; le matériel est bloqué pendant la validité du devis (7 jours par défaut).

## Organisation du code

```
src/
  data/seed.json        catalogue de départ (matériel, packs, zones, paramètres)
  lib/media.ts          adresses et tailles des photos
  lib/rules.ts          règles de prix, de dates et de stock
  lib/api/              accès aux données : supabase.ts (en ligne) et demo.ts (aperçu)
  pages/public/         pages du site
  pages/account/        espace client
  pages/admin/          administration
supabase/
  migrations/           base de données, règles de sécurité, calculs côté serveur
  seed.sql              catalogue de départ (généré depuis seed.json)
  functions/            paiement Stripe, confirmation de paiement, e-mails
public/brand/           logos vectoriels (couleur, fond sombre, blanc, noir) et PNG
public/photos/          photos du site (sans métadonnées, en 1 600 et 800 px)
PHOTOS.md               provenance de chaque photo et accords à obtenir pour celles venues d’Internet
```

Les prix et les disponibilités sont toujours recalculés par la base de données à la réservation : un client ne peut pas modifier un prix ni réserver du matériel déjà pris depuis son navigateur.

## Commandes

```bash
npm install            # une seule fois
npm run dev            # site en local (nécessite .env.local, voir .env.example)
npm run build          # version de production dans dist/
npm run build:demo     # aperçu autonome sans serveur : dist-demo/apercu.html
node scripts/test-db.mjs   # tests de la base de données (Postgres local, sans compte)
npm run seed:sql       # régénère supabase/seed.sql après modification de seed.json
npm run logos          # régénère les logos vectoriels
```

## Technologies

React, TypeScript et Tailwind CSS pour le site ; Supabase pour la base de données, les comptes et les photos ; Stripe pour l’acompte ; Resend pour les e-mails ; Cloudflare Pages pour l’hébergement.
