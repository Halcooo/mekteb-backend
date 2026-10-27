# Plan svakog budućeg deploya

Ovaj postupak se koristi i za ovo izdanje i za buduće funkcionalnosti. Detaljne hosting komande su u [CPANEL_DEPLOY.md](CPANEL_DEPLOY.md), a telefoni u [PHONE_TEST.md](PHONE_TEST.md).

## Brzi tok za sljedeći deploy

Ovo izdanje je uključivalo jednokratno sređivanje starog projekta, SSH/SFTP pristup, prelazak na Node 24, kompatibilnost stare sheme, trajne sesije i prvi push cron. To se ne ponavlja pri redovnom deployu. Za običnu promjenu koda cilj je nekoliko minuta na hostingu poslije lokalnih testova; promjene baze imaju zasebnu probu i ne obećavaju isti rok.

1. Pročitati ovaj zapis i provjeriti aktivni `mekteb-shared/active-release.json`. Koristiti postojeći autorizovani ključ, SFTP i postojeći cPanel alat. Ne kreirati novi ključ, aplikaciju, bazu ili VAPID/JWT ključeve bez stvarne potrebe. SSH shell nije uključen; ne trošiti vrijeme na SSH komande koje hosting odbija.
2. Provjeriti Git kandidate sa `npm run security:check` u backendu i `node ../backend/deploy/security-check.cjs --repo .` u frontendu. Poslije staginga ponoviti s `--staged`; tajne, privatne kopije i stvarni `.env` ne smiju u commit. Ranije objavljena tajna mora se zamijeniti; uklanjanje datoteke ne briše historiju. Ne koristiti force push radi čišćenja historije bez posebnog dogovora.
3. `npm run release:prepare` iz backend direktorija provjerava oba dijela i pravi paket/manifest/hash. Zapisati ID i hash. Ne ponavljati cijeli ručni obilazak svih funkcija ako se promijenio samo mali dio; provjeriti promijenjene tokove i obaveznu javnu smoke provjeru.
4. Novi paket raspakovati u novi privatni `mekteb-releases/<id>`, provjeriti manifest i instalirati Linux produkcijske zavisnosti. Sačuvati prethodni aktivni ID i frontend index/config. Ne mijenjati aktivni release direktorij i ne instalirati preko njegovog node_modules. Privatna konfiguracija i slike već su trajni u `mekteb-shared`.
5. Pročitati migracijski `status` novog kandidata uz postojeći privatni env. **Nula pending migracija:** ne pokretati legacy bridge, adoption, restore baze ili ponovo prepisivati stare uploads. **Pending migracije:** napraviti svježi backup, probni restore i pregledanu migraciju na kopiji; tek zatim kratko pauzirati API i cron za produkcijsku promjenu. `upgrade-legacy` i `deploy/tools/production.cjs` su postupak prvog prelaza iz ovog izdanja, ne prečica za sljedeće izdanje.
6. Za backend promjenu kratko zaustaviti postojeći API, atomski promijeniti `active-release.json`, postaviti matching frontend uz zadržavanje starih hashiranih asseta i pokrenuti/restartovati postojeći API. Node 24.6.0 / Production / `app-current.cjs` ostaju isti. Cron već prati isti pointer i ne dodaje se ponovo. Ako se mijenja samo frontend, ne zaustavljati API niti dirati bazu.
7. Pokrenuti `npm run deploy:check`, potvrditi HTTP→HTTPS i provjeriti samo relevantne prijavljene tokove. Poslije promjene push/SW/session koda uključiti stvarni test telefona. Zapisati ishod i prethodni ID za povratak, pa uraditi traženi commit/push nakon provjere staged sadržaja.

Povratak bez promjene sheme koristi prethodni release pointer i sačuvani frontend index/config, uz restart API-ja. Povratak poslije DDL-a zahtijeva pregled kompatibilnosti i očuvanje novih podataka; ne vraćati staru bazu preko novog rada korisnika.

## Trenutno aktivno izdanje

| Stavka | Potvrđeno stanje |
|---|---|
| Datum | 27.10.2026. |
| Release | `20261027T202834552Z-cpanel` |
| SHA-256 paketa | `0ccc5eca8a231fb01a4f9a1bef558726aff4f8769668351a87548c5e970fd0e6` |
| Backend | `/storage1/mektebpa/mekteb-releases/20261027T202834552Z-cpanel/backend` |
| Node Selector | postojeći root `api.mekteb-pazaric.com`, Node 24.6.0, Production, `app-current.cjs` |
| Konfiguracija / slike | `mekteb-shared/backend.env` / `mekteb-shared/news-images` (15 kopiranih datoteka) |
| Frontend / API document root | `public_html` / `public_html/api.mekteb-pazaric.com`; backend kod je izvan javnog roota |
| Baza | MariaDB 10.11.10, migracije 000–006 evidentirane, preflight prolazi |
| Podaci | 35 koraka kompatibilnosti; svi izvorni zapisi imaju iste hash-eve prije/poslije |
| HTTPS | 8/8 javnih provjera prolazi, uključujući WS; oba HTTP ulaza vraćaju 301 na HTTPS |
| Cron | jedan posao svake minute; stvarni log potvrđuje `completed batches=1 claimed=0` |
| Telefon / stvarna prijava vlasnika | vlasnik odgodio završnu provjeru na telefonu; ne voditi kao potvrđenu dostavu |
| Sigurnost Git-a | lokalne env datoteke uklonjene iz praćenja; nove tajne nisu u promjenama; ranije izložena DB lozinka zamijenjena uz vlasnikov završni klik, stara odbijena |

Stvarni cron, potvrđena Node putanja i loader:

```text
/usr/bin/flock -n /storage1/mektebpa/mekteb-shared/push-worker.lock /opt/alt/alt-nodejs24/root/usr/bin/node /storage1/mektebpa/api.mekteb-pazaric.com/app-current.cjs worker >> /storage1/mektebpa/mekteb-shared/logs/push-worker.log 2>&1
```

Privatne vrijednosti nikada ne kopirati u ovaj dokument. JWT/refresh i VAPID ključevi se čuvaju stabilno u privatnoj konfiguraciji; DB lozinka je zamijenjena 27.10.2026. zbog ranijeg izlaganja u Git historiji. Provjereni su novi pristup, odbijanje stare lozinke, preflight i restart. Stari Git commitovi nisu prepisivani; uklanjanje env datoteka iz novog commita ne briše njihov raniji sadržaj. Za buduću stvarnu rotaciju koristiti vlasnikov završni korak i ponoviti javni health/cron check.

## Zabilježeno stanje hostinga - 27.10.2026.

- cPanel račun `mektebpa`, home `/storage1/mektebpa`, domena `mekteb-pazaric.com`, API `api.mekteb-pazaric.com`.
- Početno stanje bilo je CloudLinux Node.js Selector, root `api.mekteb-pazaric.com`, startup `index.js`, Development, Node 22.8.0. Aktivna aplikacija sada koristi gornje potvrđene produkcijske postavke.
- Stvarna baza je MariaDB 10.11.10. Posebna MariaDB migracijska i runtime proba je završena, pored lokalnih MySQL 8.0.43 rezultata.
- Poseban deploy SSH ključ je autorizovan uz izričitu potvrdu vlasnika. SFTP radi; interaktivni/komandni SSH vraća da shell pristup nije omogućen. Privatni ključ je lokalno van repozitorija.
- Preuzeta je svježa cPanel kopija produkcijske baze i smještena u zaštićeni lokalni direktorij van oba repozitorija. Gzip integritet i SHA-256 su provjereni. Restore je uspješno potvrđen u `mektebpa_rehearsal_20261027` na istoj MariaDB 10.11.10; svih devet tabela ima isti broj zapisa. Privatni `restore-report.json` čuva dokaz.
- Sačuvano je 112 datoteka prethodnog koda, konfiguracije, slika i frontenda, sa SHA-256 manifestom. Kopija je privatna, izvan repozitorija. Dodatno je na istom serveru sačuvana kopija starog Node 22 node_modules za oporavak; ne prenosi se kao Windows/Linux build.
- Vlasnik je posebno odobrio privremeni Node 24.6.0 alat `mekteb-deploy-tools-20261027`, rutu `/_deploy-check-20261027/` i ograničena prava postojećeg DB korisnika na probnoj bazi. Alat kroz HTTP vraća samo 404; komande se izvršavaju kroz prijavljeni cPanel Run JS script. Ne dodavati javnu migracijsku/komandnu rutu.
- Read-only audit je završio bez duplih prisustava/putanja slika, nepostojećih autora, provjerenih orphan veza i obaveznih NULL vrijednosti. Produkcijska web stranica i API health i dalje vraćaju 200.
- Početna shema nije imala migracijsku evidenciju ni dio ograničenja; imala je uže/nullable kolone i tekstualni `news.created_by`. Pregledani prelaz je prvo prošao na kopiji pa u produkciji. Ne ponavljati jednokratni bridge na sadašnjoj evidentiranoj bazi.

## 1. Priprema promjene

1. Jasno opisati funkcionalnost i uticaj na korisnike, API i bazu. Svaka migracija ima razlog, preduslove i način provjere.
2. Sačuvati rad i pregledati diff. Git commit/push nije isto što i aktivacija produkcije. Ne oslanjati se na stari ili ručno prepravljeni dist.
3. Pokrenuti testove, tipove i build. Na slabijem računaru pokretati teške provjere redom, uz umjeren broj paralelnih procesa.
4. `npm run release:prepare` pravi paket za oba repozitorija s manifestom i hash-evima. Tajne, baze, slike korisnika i node_modules ostaju izvan paketa.
5. Zapisati ID paketa, Git revizije/radnu kopiju, rezultate i poznata ograničenja. Poslije svake izmjene runtime-a/configa ponovo napraviti konačni paket.

## 2. Proba bez promjene produkcije

1. Pregledati trenutno stanje hostinga i sheme. Pripremiti kandidata u odvojenom privatnom direktoriju.
2. Kopirati bazu i slike; potvrditi integritet i uspješan restore u zasebnu bazu. Koristiti odgovarajući MariaDB alat na ovom hostingu, bez MySQL-only dump opcija.
3. Probna konfiguracija mora pokazivati isključivo na kopiju, uz isključen push. Ne dozvoliti slanje prema kopiranim stvarnim pretplatama.
4. Provjeriti kvalitet starih podataka prije dodavanja unique/FK/NOT NULL ograničenja. Konflikti se prijavljuju i rješavaju uz očuvanje izvornog zapisa; ne brisati duplikate bez arhive i provjere.
5. Na kopiji izvršiti potrebnu kompatibilnost, adoption i nove migracije. Uporediti podatke prije/poslije i pokrenuti funkcionalne testove kandidata.
6. Potvrditi runtime verziju, produkcijske komande, trajne slike, sigurnosne postavke sesija i queue locking na stvarnoj vrsti baze.

## 3. Priprema produkcijskog prozora

1. Sačuvati prethodni kod, konfiguraciju, slike i završnu bazu. Rezervna kopija ima vrijeme, SHA-256, lokaciju i dokaz restore-a.
2. Odrediti kratki prozor i zaustaviti nove upise tokom promjene sheme i odluke o povratku. Zaustaviti postojeće workere ako se mijenja njihov model podataka.
3. Imati spreman prethodni paket i provjeren plan oporavka aplikacije i baze. DDL se ne vraća opštim transakcijskim rollback-om.
4. Ako nedostaje backup, kompatibilnost ili prolazna kritična provjera, izdanje ostaje kandidat. Postojeća aplikacija nastavlja raditi.

## 4. Aktivacija i provjera

1. Primijeniti samo pregledane promjene baze. Provjeriti `status` i produkcijski preflight.
2. Aktivirati matching backend/frontend paket i kontrolisano restartovati aplikaciju. Sačuvati prethodni root i stare hashirane assete tokom prelaza.
3. Izvršiti HTTPS smoke provjeru, prijavu/refresh/reload/odjavu, pregled postojećih učenika, prisustva, objava i razgovora.
4. Provjeriti cron, queue i jednu dogovorenu push poruku na Androidu i iPhoneu sa zatvorenom aplikacijom. Prihvat push servisa nije isto što i prikaz na telefonu.
5. Poslije uspjeha omogućiti upise, pratiti greške i upisati stvarne rezultate u dnevnik izdanja.

## 5. Povratak i zatvaranje

1. Ako kontrolne provjere ne prođu, vratiti prethodni kod i shemu prema provjerenom planu dok su upisi zaustavljeni.
2. Ako su korisnici već upisivali nove podatke, plan mora prvo očuvati te zapise; ne vraćati staru kopiju preko novih podataka naslijepo.
3. Zadržati backup i prethodni paket prema dogovorenom roku. Kopije su van javnih direktorija i zaštićene pravima pristupa.
4. Ukloniti nepotrebne probne podatke/direktorije tek nakon provjere cilja; opozvati privremeni pristup kada nije potreban.
5. Dopuniti README, tehničku evidenciju i korisnička uputstva ako se korisnički tok promijenio.

## Dnevnik izdanja

Za svako izdanje zapisati:

| Podatak | Vrijednost |
|---|---|
| ID paketa / SHA-256 | Popuniti |
| Razlog promjene / funkcionalnosti | Popuniti |
| Prethodna verzija / mjesto povratka | Popuniti |
| Backup baze/slika/configa i restore dokaz | Popuniti, bez tajni |
| Vrsta/verzija baze i migracije prije/poslije | Popuniti |
| Rezultat probne migracije i provjera podataka | Popuniti |
| Vrijeme zaustavljanja/ponovnog otvaranja upisa | Popuniti |
| HTTPS, sesije, chat i push rezultati | Popuniti |
| Konačna odluka / otvorene stavke | Popuniti |

Završeno: backup/restore i hosting proba, produkcijska migracija i aktivacija, HTTPS smoke i stvarno cron izvršavanje. Proba na kopiji obuhvatila je tri uloge, Secure/HttpOnly cookie, refresh, pristup učenicima, konkurentni idempotentni chat, bosanski tekst, notifikacije, read/logout i paralelni SKIP LOCKED worker. Push transport u probi bio je simuliran; telefon je vlasnik odgodio za kasnije. Ne predstavljati ga kao potvrđeni real-device rezultat.

Plan aktivacije ovog izdanja: novi runtime u `mekteb-releases/<id>/backend`, stabilni privatni `api.mekteb-pazaric.com/app-current.cjs` i atomski `mekteb-shared/active-release.json`. Prethodni `index.js`, njegov kod i `.env` ostaju sačuvani. Node Selector prelazi na Node 24.6.0 / Production / `app-current.cjs`; cron koristi isti loader s argumentom `worker`. Povratak na stari startup je moguć tek uz odgovarajuću odluku o kompatibilnosti/restore-u baze. Prije DDL-a API mora biti zaustavljen, cron je provjeren i trenutno ne postoji, a produkcijski hash-evi moraju odgovarati vraćenom backupu. Nova konfiguracija i slike su u `mekteb-shared`, van web root-a i runtime paketa.
