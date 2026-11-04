# Mettre le site en ligne

Comptez une demi-journée la première fois. Tout se fait depuis un navigateur, sauf l’étape 2 qui demande un ordinateur avec Node.js (une seule fois). Faites d’abord tout en **mode test Stripe**, vérifiez le parcours complet, puis passez en paiement réel à l’étape 9.

## Ce que ça coûte

| Service | Rôle | Prix |
|---|---|---|
| Nom de domaine `alpes-sound-location.fr` | adresse du site | environ 7 à 12 € par an |
| Cloudflare Pages | hébergement du site | gratuit |
| Supabase (offre Free) | base de données, comptes clients, photos | gratuit |
| Resend (offre Free) | e-mails automatiques, 100 par jour, 3 000 par mois | gratuit |
| Stripe | paiement des acomptes par carte | aucun abonnement, environ 1,5 % + 0,25 € par paiement avec une carte européenne |
| GitHub | stockage du code, mises à jour automatiques | gratuit |

## 1. Acheter le nom de domaine et créer les comptes

1. Achetez `alpes-sound-location.fr` chez un registraire (OVH, Gandi, IONOS…).
2. Créez un compte gratuit sur **cloudflare.com**, cliquez **Add a domain**, saisissez votre domaine et choisissez l’offre Free. Cloudflare vous donne deux serveurs de noms : remplacez ceux de votre registraire par ceux-ci (dans l’espace client du registraire, rubrique « Serveurs DNS »). L’activation prend de quelques minutes à quelques heures.
3. Créez un compte sur **github.com**, puis un dépôt **privé** nommé `alpes-sound-location`. Envoyez-y le contenu de ce dossier (bouton *uploading an existing file*, ou `git push`). Ne mettez jamais de fichier `.env` ni de clé secrète dans le dépôt.
4. Créez un compte sur **supabase.com**, **stripe.com/fr** et **resend.com**.

## 2. Créer la base de données (Supabase)

1. Sur Supabase, **New project** : nom `alpes-sound-location`, mot de passe fort (gardez-le), région **West EU (Paris)**.
2. Ouvrez **SQL Editor**, collez tout le fichier `supabase/migrations/20261102000000_init.sql`, cliquez **Run**. Recommencez avec `supabase/seed.sql` : le catalogue, les packs, les zones et vos paramètres sont chargés.
3. **Authentication > URL Configuration** :
   - *Site URL* : `https://alpes-sound-location.fr`
   - *Redirect URLs* : ajoutez `https://alpes-sound-location.fr/**`
4. **Authentication > Sign In / Providers > Email** : décochez **Confirm email**. Vos clients pourront réserver et payer sans aller d’abord valider un lien dans leur boîte mail ; ils reçoivent ensuite l’e-mail de confirmation de leur réservation.
5. **Project Settings > API Keys** : notez la clé **publishable** (elle commence par `sb_publishable_` ; sur un projet plus ancien, c’est la clé *anon public*), ainsi que l’adresse du projet, `https://xxxx.supabase.co` (*Project URL*, aussi affichée par le bouton **Connect** en haut de la page). Elles servent aux étapes 5 et 6. Ne copiez jamais la clé *secret* ailleurs que dans Supabase.
6. **Créez tout de suite votre compte administrateur**, avant que le site soit en ligne (sinon quelqu’un pourrait créer un compte avec votre adresse avant vous) :
   - **Authentication > Users > Add user > Create new user** : votre adresse, un mot de passe solide, et cochez **Auto Confirm User** ;
   - puis dans **SQL Editor**, exécutez (avec votre adresse) :
     ```sql
     update public.profiles set is_admin = true where email = 'remiapro@gmail.com';
     ```
     Le résultat doit indiquer *1 row affected*.

## 3. Brancher les e-mails (Resend)

1. Sur Resend, **Domains > Add domain** : `alpes-sound-location.fr`, région Europe. Resend affiche quelques enregistrements DNS : ajoutez-les dans Cloudflare (**DNS > Records**), puis cliquez **Verify** sur Resend.
2. **API Keys > Create** : nommez-la `site`, droit *Sending access*. Copiez la clé (elle commence par `re_`).
3. Pour que les e-mails de mot de passe oublié partent aussi de votre domaine, dans Supabase **Authentication > Emails > SMTP Settings**, activez *Custom SMTP* :
   - Hôte `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe : la clé `re_…`
   - Expéditeur : `reservations@alpes-sound-location.fr`, nom : `Alpes & Sound Location`
4. Toujours dans **Authentication > Emails**, modèle *Reset Password*, remplacez le texte par celui-ci (copiez-le tel quel : ce lien marche même si le client l’ouvre sur un autre appareil que celui de sa demande) :
   - Objet : `Choisissez un nouveau mot de passe`
   - Corps : `<p>Bonjour,</p><p>Pour choisir un nouveau mot de passe sur le site Alpes & Sound Location, cliquez sur ce lien :</p><p><a href="{{ .SiteURL }}/nouveau-mot-de-passe?token_hash={{ .TokenHash }}&type=recovery">Choisir mon mot de passe</a></p><p>Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>`

## 4. Préparer le paiement (Stripe, en mode test)

1. Dans Stripe, vérifiez que le bouton **Mode test** est activé.
2. **Développeurs > Clés API** : copiez la *clé secrète* (elle commence par `sk_test_`).
3. Le webhook se crée à l’étape 7, une fois les fonctions en ligne.

## 5. Envoyer les fonctions serveur (paiement et e-mails)

1. Dans Supabase, **Edge Functions > Secrets**, ajoutez :

   | Nom | Valeur |
   |---|---|
   | `STRIPE_SECRET_KEY` | la clé `sk_test_…` |
   | `RESEND_API_KEY` | la clé `re_…` |
   | `EMAIL_FROM` | `Alpes & Sound Location <reservations@alpes-sound-location.fr>` |
   | `ADMIN_EMAIL` | l’adresse où vous voulez recevoir les nouvelles réservations et demandes de devis |
   | `SITE_URL` | `https://alpes-sound-location.fr` |

   `STRIPE_WEBHOOK_SECRET` s’ajoute à l’étape 7.
2. Créez un jeton sur **supabase.com > Account > Access Tokens**.
3. Dans GitHub, **Settings > Secrets and variables > Actions**, ajoutez :
   - `SUPABASE_ACCESS_TOKEN` : le jeton
   - `SUPABASE_PROJECT_REF` : l’identifiant du projet (la partie `xxxx` de `https://xxxx.supabase.co`)
   - `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` : l’adresse du projet et la clé publishable notées à l’étape 2.5
4. Dans GitHub, onglet **Actions**, lancez **Fonctions Supabase** (*Run workflow*). Les trois fonctions apparaissent ensuite dans Supabase, rubrique Edge Functions. Elles se mettront à jour seules à chaque modification.

   Sans GitHub Actions, depuis un ordinateur avec Node.js, dans le dossier du site :
   ```bash
   npx supabase login
   npx supabase functions deploy --project-ref VOTRE_REF --use-api
   ```

## 6. Publier le site (Cloudflare Pages)

1. Dans Cloudflare, **Workers & Pages > Create > Pages > Connect to Git**, choisissez le dépôt.
2. Réglages de build :
   - *Framework preset* : Vite (ou aucun)
   - *Build command* : `npm run build`
   - *Build output directory* : `dist`
3. **Environment variables** :
   - `VITE_SUPABASE_URL` : la Project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` : la clé publishable (`sb_publishable_…`)
   - `VITE_SITE_URL` : `https://alpes-sound-location.fr`
   - `NODE_VERSION` : `22`
4. **Save and Deploy**. Une fois en ligne, onglet **Custom domains** : ajoutez `alpes-sound-location.fr` et `www.alpes-sound-location.fr`.
5. Pour que tout le monde arrive sur la même adresse (connexion et paiement en dépendent), redirigez `www` vers l’adresse sans `www` : dans Cloudflare, **Rules > Redirect Rules > Create rule**, modèle *Redirect from WWW to root* (ou règle personnalisée : nom d’hôte égal à `www.alpes-sound-location.fr`, redirection 301 vers `https://alpes-sound-location.fr` en conservant le chemin).

Chaque modification envoyée sur GitHub republie le site automatiquement.

## 7. Relier Stripe au site

1. Dans Stripe (mode test), **Développeurs > Webhooks > Ajouter une destination** :
   - URL : `https://VOTRE_REF.supabase.co/functions/v1/stripe-webhook`
   - Événement : `checkout.session.completed`
2. Copiez la *clé secrète de signature* (elle commence par `whsec_`) et ajoutez-la dans Supabase, **Edge Functions > Secrets**, sous le nom `STRIPE_WEBHOOK_SECRET`.

## 8. Tester

1. Sur le site en ligne, **Se connecter** avec le compte administrateur créé à l’étape 2.6 : le lien **Administration** apparaît en haut.
2. Faites un essai complet avec un deuxième compte (une autre adresse e-mail) :
   - réserver un pack pour un week-end et régler l’acompte avec la carte de test `4242 4242 4242 4242`, date future, code 123 ; refaire une réservation en choisissant « Totalité » : la fiche indique alors le solde comme réglé ;
   - la réservation passe en « Confirmée » : le client reçoit la confirmation et vous l’e-mail « Nouvelle réservation » ;
   - dans **Administration > Planning**, bloquez un article sur une date : il n’est plus proposé ce jour-là sur le site ;
   - demandez une durée sur mesure : vous recevez « Nouvelle demande », fixez les prix dans l’administration et validez ; le client reçoit « Votre devis est prêt » et peut payer.
3. Vérifiez les photos : dans **Administration > Matériel**, ajoutez une photo à un article.
4. Testez « Mot de passe oublié » avec le deuxième compte, en ouvrant l’e-mail sur votre téléphone.

## 9. Passer en paiement réel

1. Dans Stripe, quittez le mode test et **activez votre compte** : statut entrepreneur individuel, SIRET, pièce d’identité, IBAN pour les virements.
2. Récupérez la clé secrète réelle (`sk_live_…`), recréez le webhook de l’étape 7 hors mode test, puis remplacez `STRIPE_SECRET_KEY` et `STRIPE_WEBHOOK_SECRET` dans Supabase.
3. Faites un premier vrai paiement de petit montant pour vérifier, puis remboursez-le depuis Stripe.

## 10. Dernières touches

- **Fiche Google** : dans votre fiche d’établissement Google, remplacez l’adresse du site par `https://alpes-sound-location.fr`.
- **Base toujours active** : l’offre gratuite de Supabase met en pause un projet inactif pendant 7 jours. Le fichier `.github/workflows/keepalive.yml` l’interroge chaque matin : il fonctionne dès que les secrets `SUPABASE_URL` et `SUPABASE_PUBLISHABLE_KEY` sont dans GitHub (étape 5.3).
- **Adresse de contact à votre nom** (facultatif) : Cloudflare **Email > Email Routing** peut faire suivre `contact@alpes-sound-location.fr` vers votre Gmail, gratuitement. Pensez alors à mettre cette adresse dans **Administration > Paramètres**.
- **Conditions de location** : elles reprennent vos conditions actuelles (acompte, caution, annulation). Faites-les relire si vous avez un doute juridique, et ajustez les textes dans **Administration > Paramètres**.

## Avant d’accepter les premières réservations

- **Médiateur de la consommation** (obligatoire dès que vous louez à des particuliers, amende jusqu’à 3 000 €) : adhérez à un médiateur agréé (liste sur economie.gouv.fr, comptez quelques dizaines d’euros par an), puis indiquez son nom et son site dans **Administration > Paramètres**. Il apparaît alors dans les conditions de location et au bas des e-mails.
- **Photos venues d’Internet** : la liste et l’état des accords sont dans `PHOTOS.md`.
- **Paiement réel** : étape 9 faite, et un vrai paiement de petit montant vérifié puis remboursé.

## En cas de souci

| Symptôme | À vérifier |
|---|---|
| « Le site n’est pas encore relié à sa base de données » | les variables `VITE_…` dans Cloudflare, puis relancer un déploiement |
| Le paiement ne démarre pas | `STRIPE_SECRET_KEY` dans les secrets Supabase, fonction `create-deposit-checkout` déployée |
| Paiement fait mais réservation pas confirmée | URL du webhook Stripe, `STRIPE_WEBHOOK_SECRET`, journal de la fonction `stripe-webhook` dans Supabase |
| E-mail « Paiement remboursé automatiquement » | normal : le client a payé une réservation déjà annulée ou déjà payée, ou après le délai alors que le matériel était repris. Le site l’a remboursé et prévenu, rien à faire |
| E-mail « À rembourser » | le remboursement automatique a échoué : remboursez depuis Stripe (**Paiements**), puis **Marquer comme remboursé** dans la réservation |
| Pas d’e-mail | domaine vérifié sur Resend, `RESEND_API_KEY` et `EMAIL_FROM`, journal de la fonction `notify` |
| Le site affiche une erreur après une semaine sans visite | projet Supabase en pause : **Restore project**, puis vérifier le workflow keepalive |
