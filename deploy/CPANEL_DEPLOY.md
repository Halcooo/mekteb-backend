# HTTPS deploy na postojećem cPanelu

Namjena: `https://mekteb-pazaric.com` i `https://api.mekteb-pazaric.com`. Koristiti isti provjereni paket za oba dijela. Ovaj dokument priprema kontrolisanu promjenu; stvarno stanje hostinga i produkcijske baze mora se provjeriti prije aktivacije.

## 1. Pristup i stanje prije promjene

- SSH ključ se autorizuje za postojeći cPanel račun, uz provjeru SSH host fingerprinta. Privatni ključ ostaje na lokalnom računaru, van repozitorija i release paketa. Poslije rada ključ se može opozvati.
- Na serveru potvrditi stvarni `$HOME`, korisnika, domena/document root mapiranja, aplikacijski root, Node binarnu putanju, startnu datoteku, postojeći cron, verziju baze i stanje SSL certifikata. Dana 27.10.2026. potvrđeni su `/storage1/mektebpa`, CloudLinux Node.js Selector, postojeći API root `api.mekteb-pazaric.com`, startup `index.js`, Development/Node 22.8.0 i dostupan Node 24.6.0. Ovo su zabilježene postavke, ne ciljna produkcijska konfiguracija.
- Potrebni su Node.js 22.14+, provjerena MySQL 8 ili MariaDB 10.11 baza, cron i izlazni HTTPS prema push servisima. Stvarni hosting koristi MariaDB 10.11.10; prihvatanje izdanja zahtijeva zasebnu migracijsku i runtime probu na toj verziji.
- Zapisati trenutno aktivne verzije, shemu i migracije. Kopirati postojeći kod, slike i privatnu konfiguraciju u zaštićenu rezervnu kopiju van web root-a. Historijske DB/JWT tajne treba zamijeniti na hostingu; ne prepisivati postojeće lozinke korisnika.

## 2. Pripremiti provjereni paket lokalno

U backend repozitoriju:

```text
npm ci
npm run release:prepare
```

Komanda provjerava backend tipove/testove/build i frontend testove/lint/build. Frontend dobija tačan javni HTTPS API URL kroz procesnu varijablu, bez prepisivanja privatnih env datoteka. Nastaju `release/<id>/`, istoimeni `.tar.gz`, SHA-256 i `release/latest.json`. Manifest sadrži hash svake datoteke.

Paket uključuje backend runtime, migracije, produkcijske CLI komande, frontend i korisnička PDF uputstva. Ne uključuje `.env`, SSH ključeve, podatke/slike korisnika, QA baze niti Windows `node_modules`. Provjere na stvarnom izolovanom MySQL-u vode se odvojeno i moraju proći prije produkcijske aktivacije.

## 3. Kandidat i migracijska proba

Raspakovati paket u privatni direktorij novog kandidata, npr. `$HOME/mekteb-releases/<id>`, van `public_html` i API document root-a. Provjeriti:

```text
node backend/deploy/verify-release.cjs /apsolutna/putanja/do/raspakovanog/paketa
```

U kandidatu `backend/`, s provjerenim Linux Node.js binarnim direktorijem u PATH-u, izvršiti `npm ci --omit=dev`. Native zavisnosti instaliraju se na serveru. Postojeći aktivni backend i njegov `node_modules` se u ovoj fazi ne mijenjaju.

Napraviti konzistentan dump produkcijske baze, smjestiti ga van web root-a i vratiti u zasebnu probnu bazu na serveru. Na ovom hostingu radi SFTP, a SSH shell je isključen. Koristiti cPanel Backup za preuzimanje baze i CloudLinux Run JS script za pregledane kratkotrajne CLI komande. Ne zaobilaziti ograničenje javnim izvršnim HTTP endpointom. Odobreni privremeni alat vraća samo 404; svoje izvještaje i kopije čuva izvan web root-a.

Ako hosting kasnije omogući shell, koristiti odgovarajući MariaDB klijent i zaštićeni option file (`0600`), bez lozinke u argumentima ili historiji terminala. Primjer uz prethodno provjerene privilegije:

```bash
umask 077
mariadb-dump --defaults-extra-file="$HOME/mekteb-shared/mysql-client.cnf" --single-transaction --triggers --no-tablespaces "$PRODUCTION_DB" > "$BACKUP_FILE"
```

Dump je dokaz tek kada se uspješno vrati. Routines/events, ako postoje na stvarnoj bazi, moraju se obuhvatiti dodatnim provjerenim opcijama. Izvorna produkcijska baza se ne koristi kao odredište probnog restore-a.

Napraviti zaseban zaštićeni env za probnu bazu i poseban direktorij kopiranih slika. Push ključevi u probnoj kopiji ostaju prazni i worker se ne pokreće: kopirana produkcijska pretplata ne smije poslati testnu poruku stvarnom roditelju. Kopija ne treba javni pristup. Sve komande u nastavku prvo izvršiti na toj kopiji.

```bash
export NODE_ENV=production
export MEKTEB_ENV_FILE="$HOME/mekteb-shared/rehearsal.env"
node dist/cli/migrate.js status
```

Ako stara evidencija ima prefix checksums, provjeriti originalne migracije prije `adopt-legacy-checksums --confirm-files-reviewed`. Za postojeće osnovne tabele koje nemaju migraciju 000, prvo pregledati shemu i koristiti `adopt-baseline --confirm-schema-reviewed`. Ove radnje se ne izvršavaju naslijepo: odbijanje kompatibilnosti zahtijeva zasebnu analizu, bez brisanja migracijske historije ili postojećih zapisa.

Za konkretni stari raspored od devet tabela bez evidencije, samo `adopt-baseline` nije dovoljan: fizički postoje i tabele/kolone iz 001–004. Pregledani prelaz ima zasebne eksplicitne komande:

```text
node dist/cli/migrate.js legacy-plan
node dist/cli/migrate.js upgrade-legacy --confirm-backup-restored --confirm-writes-paused
```

Prva komanda samo čita. Druga se koristi tek poslije restore probe i zaustavljanja upisa na odabranoj bazi. Provjerava tačno poznati raspored, NULL vrijednosti, duplikate, veze, sadržaj i format ključeva; proširuje kolone bez skraćivanja, dodaje ograničenja i omogućava utf8mb4 za stare notifikacije. Ne briše zapise, ne popunjava izmišljene datume i zadržava staru tabelu `messages`. Poredi hash svakog izvornog zapisa po tabelama prije/poslije, provjerava shemu, pa atomski evidentira 000–004 s punim checksumima. Tek tada obični `up` primjenjuje 005–006. `up` nikada automatski ne pokreće ovaj prelaz. Kod prekinutog DDL-a pregledati novi `legacy-plan`; ne ponavljati restore preko popunjene baze.

```bash
node dist/cli/migrate.js up
node dist/cli/migrate.js status
node dist/cli/preflight.js
```

Preflight provjerava konfiguraciju, upis slike u trajni direktorij, vezu s MySQL-om, migracije i queue locking. Nakon probe uporediti broj i uzorke korisnika, učenika, prisustva, komentara i objava prije/poslije. Provjeriti aplikacijske tokove protiv probne baze bez slanja push-a. Zapisati rezultat prije produkcijskog prozora.

## 4. Privatna produkcijska konfiguracija i slike

Predloženo razdvajanje:

| Sadržaj | Putanja u odnosu na provjereni HOME |
|---|---|
| Aktivni privatni backend | `mekteb-app/` ili cPanel App Path koji je potvrđen |
| Konfiguracija | `mekteb-shared/backend.env`, dozvola 0600 |
| Trajne slike | `mekteb-shared/news-images/`, dozvola 0700/0750 prema korisniku procesa |
| Kopije i logovi | `mekteb-shared/backups/`, `mekteb-shared/logs/`, privatno |
| Frontend | `public_html/` potvrđene glavne domene |
| API document root | cPanel mapiranje domene; privatni kod nije statički javni sadržaj |

Koristiti `runtime.env.example`, uz stvarne DB podatke i jednom generisane JWT/VAPID ključeve. Lokalna pripremljena privatna konfiguracija ima nove ključeve, ali se DB vrijednosti i putanja upisuju tek nakon provjere hostinga. Privatne vrijednosti ne šalju se u chat niti ulaze u Git/release manifest.

`MEKTEB_ENV_FILE` u cPanel Application Manageru pokazuje na privatni `backend.env`; `NODE_ENV=production`. Iste postavke mora dobiti cron: cPanel env varijable web aplikacije nisu automatski varijable cron procesa. `UPLOAD_DIRECTORY` je apsolutan trajni direktorij, `PUSH_WORKER_MODE=external`. Kopirati i prebrojati postojeće slike iz starog `uploads/news-images` prije promjene putanje; relativna imena u bazi se zadržavaju. Ne koristiti chmod 777.

`TRUST_PROXY_HOPS` odrediti nakon provjere stvarnog proxy lanca. Ne postaviti naslijepo `true` ili proizvoljan broj: pogrešna vrijednost može spojiti sve korisnike pod isti rate limit ili omogućiti lažiranje IP-a.

## 5. Produkcijski prozor i aktivacija

1. Sačuvati provjerene rezultate probe i prethodni kod/konfiguraciju. Dogovoriti kratak prozor za promjenu, zaustaviti nove upise i završiti aktivne zahtjeve. Zaustaviti stari push cron/worker dok se mijenja shema.
2. Napraviti završni konzistentan backup baze i slika, zapisati vrijeme/hash i potvrditi restore postupak. Zadržati prethodni aplikacijski root za povratak.
3. Ponoviti `status`, samo odobrene adoption korake i `up` nad produkcijom, koristeći produkcijski env. Status mora završiti bez pending/issues. Migracije do 006 su potrebne za trajne sesije, novi chat i push red.
4. Pokrenuti `node dist/cli/preflight.js --require-push` nad novim produkcijskim backendom. Ako provjera ne prođe, aktivacija staje radi analize; ne prekrivati grešku brisanjem podataka.
5. U cPanelu podesiti privatni Application Path, API domen i Base URL `/`, Production i startni `app.js`. Node proces zadržava API prefiks `/backend/api`. Provjeriti da privatne datoteke nisu dostupne kao statički URL-ovi.
6. Kopirati odgovarajući `frontend/` u potvrđeni frontend document root. Koristiti kopiranje koje čuva `.well-known`, server konfiguraciju i druge poznate sadržaje; prvo pregledati dry-run. Ne koristiti široki `rsync --delete` nad account home-om ili web root-om. Stare hashirane assete zadržati tokom prelaza da otvoreni klijenti mogu završiti rad.
7. Restart Passenger aplikacije: kreirati/dodirnuti `tmp/restart.txt` u novom aplikacijskom root-u. U cPanelu uključiti Force HTTPS Redirect za odgovarajuće domene i provjeriti certifikate prije provjera preko HTTPS-a.
8. Pokrenuti anonimnu HTTPS provjeru, zatim stvarnu prijavu/refresh/reload/logout s preglednikom i provjeru prikaza podataka. Starije prijave moraju se ponoviti zbog prelaska na trajne sesije; postojeće lozinke korisnika ostaju iste.
9. Tek poslije uspješnih provjera uključiti cron i uraditi [test telefona](PHONE_TEST.md), pa ponovo omogućiti upise ako su svi kriteriji zadovoljeni.

Posebna uloga superadmin nije uvedena. Efendija i vlasnik imaju zasebne postojeće admin račune. Novi admin se kreira samo kada je potreban, komandom `node dist/cli/create-admin.js` uz BOOTSTRAP_ADMIN_* u zaštićenom procesnom okruženju. Ne upisivati lozinke u argumente terminala.

Za zatečeni privatni API root koristi se stabilni `app-current.cjs` iz `deploy/cpanel-entry.cjs`, uz verzionisane pakete u `mekteb-releases/<id>/backend` i atomski `mekteb-shared/active-release.json` (`{"id":"<id>"}`). Tako se ne prepisuje prethodni backend. Loader provjerava oblik ID-a i stvarnu putanju, postavlja privatni env, pa pokreće matching web ili worker runtime. Cron može pozivati isti loader s argumentom `worker`. Stari frontend asseti ostaju dostupni tokom prelaza. Kopija prethodnog Node 22 node_modules je privatno sačuvana prije promjene verzije.

## 6. Cron za dostavu bez otvorene aplikacije

Provjeriti stvarnu Node i flock putanju na hostingu. Primjer u cPanel Cron Jobs, svake minute:

```bash
/usr/bin/flock -n /storage1/mektebpa/mekteb-shared/push-worker.lock /usr/bin/env MEKTEB_NODE_BIN=/storage1/mektebpa/nodevenv/OVDJE_STVARNI_APP_ROOT/24/bin/node MEKTEB_APP_ROOT=/storage1/mektebpa/mekteb-app MEKTEB_ENV_FILE=/storage1/mektebpa/mekteb-shared/backend.env /bin/bash /storage1/mektebpa/mekteb-app/deploy/run-push-cron.sh >> /storage1/mektebpa/mekteb-shared/logs/push-worker.log 2>&1
```

Ovaj cron je primjer do potvrde putanja. Bez flock-a zamjenski raspored treba provjeriti prije aktivacije. Queue koristi MySQL leases/SKIP LOCKED, a svaka batch obradi do 10 paralelnih dostava s provider timeoutom. Jedan prolaz ima ograničen broj batch-eva/vremena i čeka završetak već započetog batch-a. Greška se zapisuje bez sadržaja poruka/endpointa; poslovi ostaju za retry. Cron donosi moguću odgodu do naredne minute; nije obećana trenutna dostava.

Passenger može ugasiti neaktivan web proces, zato se za ovaj hosting ne oslanjamo samo na inline timer. Ako hosting ima više web procesa, live događaji su procesno lokalni i chat ima polling fallback; push red ostaje trajni. Podesiti jedan web proces gdje hosting to podržava ili provjeriti potrebu za zajedničkim brokerom pri kasnijem skaliranju.

## 7. HTTPS provjera i povratak

U backend root-u kandidata/aktivne aplikacije s instaliranim produkcijskim zavisnostima:

```text
node deploy/check-https.cjs
```

Provjerava TLS/stranice, deep link, service worker/cache, manifest/ikone, bazu, CORS, CSRF, anonimne zabrane i WebSocket upgrade/autentikacijsku kapiju. Ne šalje poruke niti mijenja produkcijske korisnike. Izvještaj `https-check-results.json` ne sadrži tajne. Ako hosting potvrđeno nema WebSocket podršku, `--allow-polling` označava prihvaćen HTTP polling fallback, uz obaveznu provjeru UX-a i bez tvrdnje da je WebSocket prošao.

Kod neuspjeha sačuvati logove i vratiti prethodni kod/mapping prema unaprijed provjerenom planu. MySQL DDL nema opšti transakcijski rollback: ako je shema promijenjena i prethodni kod nije kompatibilan, koristi se provjeren restore ili posebno pregledana korektivna migracija. Restore ne smije izgubiti nove produkcijske zapise: zato se upisi drže zaustavljeni dok odluka o uspjehu/povratku nije donesena. Poslije ponovnog otvaranja upisa povratak zahtijeva dodatno usklađivanje novih podataka.

## Izvori i ograničenja

- [cPanel Git deployment](https://docs.cpanel.net/knowledge-base/web-services/guide-to-git-deployment/): prepoznaje `.cpanel.yml`; Git aktivacija traži commit i čistu radnu kopiju. Novi Git taskovi u projektu samo pripremaju staging kandidata, bez automatske migracije ili objave.
- [cPanel Node.js instalacija](https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-node.js-application/) i [Application Manager](https://docs.cpanel.net/cpanel/software/application-manager/): aplikacijski path, production env i `app.js`.
- [cPanel restart](https://support.cpanel.net/hc/en-us/articles/1500002443862-How-to-restart-an-application-that-s-using-cPanel-s-Application-Manager): `tmp/restart.txt`.
- [Passenger konfiguracija](https://www.phusionpassenger.com/docs/references/config_reference/apache/): neaktivni procesi mogu se zaustavljati.
- [Vite env prioritet](https://vite.dev/guide/env-and-mode.html): procesna javna API varijabla ima prednost pri buildu.
- [CloudLinux LVE Manager](https://docs.cloudlinux.com/cloudlinuxos/lve_manager/): Node.js Selector i Run JS script iz `package.json`.
- [MariaDB SELECT](https://mariadb.com/docs/server/reference/sql-statements/data-manipulation/selecting-data/select) i [mariadb-dump](https://mariadb.com/docs/server/clients-and-utilities/backup-restore-and-import-clients/mariadb-dump): queue locking i odgovarajući backup alat. MySQL-only `--set-gtid-purged` ne koristiti za MariaDB.

Priprema paketa nije dokaz da je cPanel server spreman. Završetak deploya zahtijeva zapis stvarnog preflighta, probne migracije/restore-a, HTTPS provjere i dostave na uređaje.
