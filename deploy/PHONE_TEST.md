# Završna provjera na Androidu i iPhoneu

Provjeravati tek nakon uspješnog HTTPS preflighta, migracija i aktiviranja cron-a. Koristiti dogovoreni testni razgovor i opću poruku; ne slati masovnu obavijest roditeljima. Za prvi test obezbijediti dva odvojena računa/preglednika: pošiljalac i primalac.

## Preduslovi

- Ispravan HTTPS certifikat za frontend i API, `/sw.js` kao JavaScript bez dugog cache-a, manifest i ikone dostupni.
- `node dist/cli/preflight.js --require-push` i `node deploy/check-https.cjs` prolaze na hostingu.
- Cron je aktivan i zadnji prolaz se vidi u privatnom logu. Stabilni VAPID ključevi su isti za API i worker.
- Preglednik/OS podržava push, dozvola uključena i uređaj ima internet. Kod iPhonea/iPada koristiti Home Screen web aplikaciju na iOS/iPadOS 16.4 ili novijem.

## Test po uređaju

| Korak | Očekivano | Rezultat / vrijeme |
|---|---|---|
| Prijava primaoca i reload | Isti račun i djeca, bez ponovnog ručnog unosa lozinke | Popuniti |
| Poruke → Postavke obavijesti → Uključi | Browser dozvola i uključeno stanje; API pretplata sačuvana | Popuniti |
| Zatvoriti aplikaciju i zaključati telefon | Primalac nema aktivan ekran razgovora | Popuniti |
| Drugi račun šalje jednu probnu poruku | Poruka u bazi, obavijest i job nastaju zajedno | Popuniti |
| Sačekati cron prolaz | Telefon prikazuje opću obavijest bez imena djeteta/sadržaja | Popuniti |
| Dodir obavijesti | Otvara prijavljeni račun i pravi razgovor/poruku | Popuniti |
| Isključiti obavijesti u aplikaciji | Na sljedeću poruku nema dostave tom uređaju | Popuniti |
| Ponovo uključiti pa odjava | Nova poruka ne prikazuje kasnu obavijest starom računu | Popuniti |
| Drugi račun na istom telefonu | Stari account binding ne prikazuje tuđe obavijesti | Popuniti |
| Roditelj prekine vezu s testnim djetetom | Nema pristupa niti dostave novih poruka tog djeteta | Popuniti |
| Odbijena dozvola / Focus / bez mreže | Jasno stanje, oporavak nakon uključivanja i povratka veze | Popuniti |

Na iPhoneu: Safari → dijeljenje → Add to Home Screen, uz Open as Web App kada je ponuđeno. Otvoriti novu ikonu, prijaviti se i tek onda uključiti obavijesti. [Apple uputstvo](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios), [WebKit podrška](https://webkit.org/blog/13878/).

Zapisati model/OS/preglednik, vrijeme slanja i prijema, cron prolaz i ishod dodira. Fotografiju zaključanog ekrana praviti samo za dogovoreni test, bez drugih privatnih obavijesti. `sent` u bazi znači da je push servis prihvatio zahtjev; to samo po sebi ne potvrđuje prikaz na telefonu. Stvarni prijem se potvrđuje na uređaju.

## Izdanje se prihvata kada

Prijava, sesije, podaci, chat i postojeće funkcije rade na novom hostingu; probne migracije i povratak iz kopije su potvrđeni; Android i iPhone testovi imaju stvarne rezultate. Neizvršene korake voditi kao neprovjerene, nikad kao prošle.
