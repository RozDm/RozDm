---
title: "3-2-1-regelen for sikkerhetskopiering: tenk i uavhengige feil"
description: "En sikkerhetskopi bedømmes bare på gjenopprettingen. 3-2-1 er en modell for uavhengige feil: hver del svarer på en trussel, og du ser hvorfor regelen er slik."
date: "2026-11-21"
tags: ["Sikkerhet"]
draft: true
---

En sikkerhetskopi bedømmes på én ting: om du får dataene tilbake når du trenger dem. Alt før det er forberedelse, og alt som ikke er prøvd, er en påstand.

3-2-1-regelen, som ofte tilskrives fotografen Peter Krogh, blir gjerne husket som tre tall. Det er den svakeste måten å bruke den på. Tallene er en kortform av en modell: kopiene dine skal ikke kunne gå tapt av samme årsak. Forstår du modellen, ser du hvorfor regelen ser ut som den gjør, og når den ikke er nok.

## Modellen: uavhengige feil

Alt som kan ødelegge data, har en rekkevidde. En slettet fil rammer én fil, en død disk én disk, en brann et helt rom. Uavhengighet er derfor ikke ja eller nei, men relativ til en trussel: **to kopier som kan tapes av samme årsak, er én kopi mot den årsaken.** Originalen og en kopi i samme rom er én kopi mot brann, men to mot en død disk.

Spørsmålet å stille er derfor: **for hver hendelse jeg må overleve, hvor mange kopier er igjen etterpå?** Er svaret null, har du ingen beskyttelse mot den hendelsen. Er det én, har du ingen margin. Bestem hvilke hendelser som trenger margin.

## Regelen, del for del

| Del | Trusselen den svarer på | Uten den |
| --- | --- | --- |
| 3 kopier av dataene, originalen medregnet | En ny feil mens du gjenoppretter etter den første | En feil under gjenopprettingen, og du står uten noe |
| 2 ulike slags lagring | Feil som rammer en hel type: samme produksjonsfeil, samme slitasje, samme programfeil | Én systematisk feil tar alle kopiene samtidig |
| 1 kopi på et annet sted | Hendelser som tar et helt sted: brann, vann, tyveri, lynnedslag, overspenning | Alle kopiene står innenfor samme hendelse |

**Hvorfor tre.** Med tre kopier etterlater ett enkelt tap (en død disk, en slettet fil) fortsatt to: én å gjenopprette fra og én i reserve hvis gjenopprettingen svikter. Det trengs fordi gjenopprettingen er en full lesing under press, den første på lenge, og det er da skjulte feil viser seg. Mot tap av et helt sted eller en feil i én type lagring garanterer 3-2-1 bare at én kopi overlever, uten margin. Det er det minste regelen gir, et valg og ikke et teorem: data som trenger margin også der, trenger flere kopier, slags eller steder.

**Hvorfor to slags.** Det som teller, er at feilmåtene er ulike, ikke merkelappene. To disker av samme type, kjøpt og tatt i bruk sammen, slites likt og kan ha samme skjulte feil. Det samme gjelder to kopier styrt av samme programvare. Med tre kopier på to slags deler to av dem en art: rammes den av en feil, står du igjen med én kopi uten margin.

**Hvorfor ett annet sted.** Hvor langt unna det må være, avgjøres av hendelsen du verner mot: det må ligge utenfor rekkevidden til det som kan ramme originalen. Samme rom, samme bygg eller samme strømkurs betyr samme skjebne.

## Bestem først hva du må tåle

To tall styrer resten, og de er avgjørelser, ikke tekniske detaljer. **RPO** (Recovery Point Objective) er hvor mye data du tåler å miste, målt i tid. **RTO** (Recovery Time Objective) er hvor lenge du tåler å være nede.

RPO bestemmer hvor ofte du kopierer: en kopi hver natt betyr at du kan miste opptil et døgn. Lav RPO kommer sjelden av å kopiere alt ofte, men av en basiskopi pluss et kontinuerlig arkiv av transaksjonsloggen. Da avhenger RPO av loggen, ikke av hvor ofte fullkopiene kjører. RTO bestemmer medier og plassering, for det tar tid å hente tilbake store datamengder over en langsom linje. En kopi som trenger en uke for å komme tilbake, er en kopi mot katastrofer, ikke mot en feil på en tirsdag. Derfor har mange to nivåer: en nær og rask kopi for hverdagens feil, og en fjern kopi for det som tar hele stedet.

Skriv tallene ned før du velger løsning, og mål mot dem senere.

Sorter også dataene, for ikke alt fortjener hele regelen og lang historikk. **Uerstattelige data** får begge deler. **Reproduserbare data** trenger bare det som gjenskaper dem: kode og konfigurasjon, som du tar vare på. **Midlertidige data**, som hurtigbuffere, byggeresultater og indekser som kan bygges på nytt, trenger ingen kopi. Uten sorteringen eksploderer både kostnaden og RTO.

## Det som ikke er en sikkerhetskopi

Tre ting ligner på en sikkerhetskopi, og er nyttige, men svarer på et annet spørsmål:

- **RAID og replikering** gir tilgjengelighet: tjenesten går videre når en disk eller en maskin faller ut. I sin vanlige, synkrone form skriver de det samme til alle kopiene umiddelbart, så en sletting, en ødelagt fil og en feilaktig overskriving blir kopiert like raskt som alt annet. Forsinket replikering gir et vindu til å stoppe feilen før den sprer seg og gjenopprette fra den etterslepende repliken, men ligger fortsatt i samme administrative domene.
- **Synkronisering** holder to steder like. Slett en fil på det ene, og den forsvinner fra det andre. En synkroniseringstjenestes versjonshistorikk eller papirkurv hjelper mot noen feil, men ligger i samme administrative domene.
- **Øyeblikksbilder på samme system** er gode til rask angring, men ligger i samme feildomene: samme maskinvare, samme filsystem, samme administratorer. Faller systemet, faller bildene med det. De blir først en kopi når de er kopiert ut.

En enkel test: **kan én kommando eller én feil i produksjon fjerne denne kopien?** Hvis ja, er den ikke en sikkerhetskopi. Å bestå testen er nødvendig, ikke tilstrekkelig: kopien må også ligge utenfor maskinvare- og stedsdomenet. Øyeblikksbilder som produksjonen ikke kan slette, deler fortsatt maskinvaren.

## Konsistens

Kopierte filer er ikke det samme som en konsistent tilstand. En database som kopieres på filnivå mens den kjører, kan bli ubrukelig. Hører systemer sammen, kan de bli tatt på ulike tidspunkter: databasen klokken 02.00 og fillageret den peker på klokken 02.40. Bruk databasens egen konsistente dump eller øyeblikksbilde. Endrer relaterte systemer seg stadig, gjør ingen rekkefølge dem konsistente; den avgjør bare hvilken vei de glir fra hverandre. Ta systemet som refererer først, og det det refererer til etterpå (databasen før fillageret): da finnes hvert objekt databasen nevner, og ekstra objekter er ufarlige, så lenge objekter slettes først en stund etter at den siste referansen til dem er borte.

## Uavhengighet er den egentlige regelen

Maskinvare og sted er lette å se. Det administrative domenet glemmes. Er alle kopiene tilgjengelige med samme konto, samme legitimasjon eller fra samme administrasjonsmaskin, kan én feil slette dem alle: en kompromittert maskin, en ansatt med dårlig dag, et opprydningsskript med feil sti. Fysisk er kopiene atskilt, men administrativt er de én.

Det betyr:

- **Atskilt tilgang.** Sikkerhetskopiene har egne kontoer og egen legitimasjon. At du administrerer produksjonen, skal ikke gjøre deg til administrator av kopiene.
- **Minste privilegium.** Produksjonssiden kan skrive nye kopier, men ikke slette eller overskrive de gamle. Best er at sikkerhetskopisystemet henter dataene selv med bare lesetilgang, så en overtatt produksjon ikke har noen nøkkel til kopiene. Oppbevaringsreglene settes og håndheves også der, ikke av systemet kopiene kommer fra.
- **Så få felles avhengigheter som mulig.** Samme passordbehandler eller samme administrasjonsverktøy er et felles feilpunkt, uansett hvor mange kopier som ligger bak.
- **Organisatorisk og avtalemessig domene.** Kopier hos samme leverandør, under samme avtale, juridiske enhet eller betaling kan dele skjebne selv med atskilte kontoer og uforanderlighet: en konto stengt ved en feil eller for brudd på vilkår, data slettet etter en ubetalt regning, en leverandør som avvikler tjenesten. Minst én kopi bør ligge utenfor dette domenet.
- **Uavhengighet i tid.** Versjoner i en inkrementell eller deduplisert kjede avhenger av hverandre: én skadet basisblokk eller en skadet indeks i arkivet kan ta alle senere versjoner. En loggkjede er det ytterste tilfellet: ett manglende logg-segment stopper gjenopprettingen på det punktet, selv om basiskopien er hel. Mottiltak: kontroller integriteten til selve arkivet jevnlig, ta uavhengige fullkopier med jevne mellomrom, og lag minst én kopi direkte fra kilden inn i et separat arkiv, ikke replikert fra samme arkiv, for da kopierer du skaden med.

## 3-2-1-1-0

Utvidelsen legger til to ledd som svarer på to feil den enkle regelen ikke dekker.

**+1: en kopi som er frakoblet eller uforanderlig.** Det er en egenskap, ikke nødvendigvis en fjerde kopi: den kan være en av de tre, ofte den utenfor stedet, og gir ikke margin i seg selv. En frakoblet kopi er fysisk atskilt, bortsett fra mens den skrives, så ingenting som kjører i nettet kan nå den. En uforanderlig kopi kan bare skrives én gang og beholdes en fastsatt tid som ingen kan korte ned, heller ikke en administrator. Garantien gjelder bare hvis lagringen selv håndhever låsen, ikke en innstilling som samme legitimasjon kan endre. Dette dekker sletting og kryptering utført med lovlig tilgang, og feil i automatikken. Prisen er at du ikke kan rydde bort kopien før tiden er ute, og at det omvendte også kan skje: den som kan skrive, kan fylle uforanderlig lagring med søppel som ingen kan slette, så kvoten fylles og nye kopier uteblir, eller regningen vokser til kontoen stenges. Begrens skriverettighetene, og sett en grense for hvor mye én kjøring kan legge til, slik at en kjøring langt over det normale stopper og slår alarm før lagringen fylles. En kvote alene verner bare budsjettet. Den samme grensen fanger en trukket kopi av søppel eller chiffertekst fra en kompromittert kilde.

**0: null feil i verifiserte gjenopprettinger.** «Jobben meldte suksess» er ikke et mål. Målet er at en gjenoppretting er lest tilbake og sammenlignet, og at den ga null feil.

## Versjoner og oppbevaringstid

En sikkerhetskopi som overskriver gårsdagens med dagens, er et speil med litt forsinkelse: ødelagte data blir kopiert ved neste kjøring. Du trenger historikk. Vanlig er nivåer som tynnes ut med alderen: daglige kopier for de siste ukene, ukentlige for månedene, månedlige for lenger tilbake.

Tallet å sammenligne med, er hvor lang tid det tar før du oppdager et problem. Begynner stille ødeleggelse i mars og du merker det i mai, og du beholder seks uker, finnes det ingen hel versjon. **Er tiden til oppdagelse lengre enn oppbevaringstiden, er dataene tapt.** Oppbevaringen må derfor overstige den lengste oppdagelsestiden du realistisk kan vente.

Den har også en øvre grense: noen data skal slettes etter en tid, og sletting må før eller siden nå også kopiene. Uforanderlighet og påkrevd sletting må forenes i utformingen. Enten er uforanderlighetsvinduet ikke lengre enn tiden sletting må skje innen, eller så krypterer du datasett med hver sin nøkkel og sletter nøkkelen (kryptografisk sletting), også de deponerte kopiene av den. Det virker bare med grov granularitet (per kunde, datasett eller periode), og det flytter problemet til nøkkellageret, som trenger sin egen utforming: det må overleve like godt som dataene, men likevel la nøkler slettes.

## Kryptering

Krypter alle kopier. For kopier som forlater din kontroll, på et annet sted, hos andre eller på medier som flyttes, er det ufravikelig, og det gjøres på din side, før dataene forlater deg, med nøkler du selv holder. Kryptering i ro med leverandørens nøkler beskytter verken mot en kompromittert konto eller mot leverandøren. Kanalen krypteres også under overføring. Husk at hver kopi også er en kopi for en tyv: flere kopier gir en større angrepsflate, og en sikkerhetskopi verner tilgjengelighet og integritet, ikke mot at data blir stjålet.

Prisen er at nøkkelen blir en enkeltfeil for alle kopiene. Da gjelder to regler. Nøkkelen skal aldri bare ligge i sikkerhetskopien den låser opp, for da trenger du kopien for å åpne kopien. Og den skal aldri bare ligge på systemet som kan dø. Oppbevar den separat, på minst to steder som ikke deler skjebne, gjerne en forseglet papirkopi et annet sted. Del den helst i deler som holdes av ulike personer eller steder, slik at ingen enkeltdel åpner dataene og tapet av én del ikke stopper gjenopprettingen (M av N). Test at en person som ikke har bygget oppsettet, kan komme til den.

Gjenopprettingen avgjør om du har en sikkerhetskopi. Krypteringen avgjør om sikkerhetskopien selv blir en trussel.

## Gjenopprettingsprøven

En sikkerhetskopi som ikke er prøvd, er en hypotese. Sikkerhetskopier svikter stille: feil sti, filer som mangler, en jobb som «lykkes» med å kopiere en tom mappe, et format som krever programvare du ikke lenger har, et medium som er ødelagt. Ingenting av dette viser seg før du gjenoppretter.

- **Stikkprøver, ofte.** Gjenopprett noen tilfeldige filer, og sjekk innholdet. Det er billig, så gjør det jevnlig.
- **Full gjenoppretting, på fast tid.** Start fra rent utstyr med bare kopien og det lag null rommer (se under): nøkkelen, veiledningen, verktøyet og tilgangen til lagringen. Ta tiden og sammenlign med RTO. Mange oppdager her at RTO var et ønske.
- **Integritet.** Lagre sjekksummer når kopien lages, og kontroller dem ved lesing og med jevne mellomrom, slik at stille datarot i en lagret kopi oppdages før du trenger den. For en database betyr gjenoppretting at den starter og består sin egen konsistenssjekk.
- **Granulær gjenoppretting.** Én tabell, én kunde, ett objekt fra en gitt dag, uten å rulle tilbake andres arbeid. Et helt systembilde kan bestå testen for full gjenoppretting og likevel feile her.

Lag null råtner stille: et utløpt token, en andre faktor knyttet til noen som har sluttet, et verktøy som ikke lenger kjører, en forseglet nøkkel fra før siste rotasjon. Prøven er det som finner det, og det som overrasket deg, rettes i veiledningen.

## Etter et innbrudd

Gjenopprett ikke hele systembilder, for da gjenoppretter du inntrengeren også. Bygg systemene på nytt fra konfigurasjon og kode, gjenopprett bare data fra et tidspunkt før innbruddet, og behandle dem som mistenkelige. Det forutsetter at en ren versjon fortsatt finnes: innbrudd oppdages ofte sent, så de hører med blant problemene oppbevaringen må vare lenger enn (se over).

## Automatisering og overvåking

Manuelle sikkerhetskopier slutter å bli tatt: en travel uke, en glemt rutine, en person som har sluttet. Automatiser tidsplan, kontroll og oppryddingen etter oppbevaringstiden.

Men automatikk svikter også stille, og et varsel om feil er ikke nok, for en jobb som aldri starter, sender ingen feilmelding. Varsle på **fravær av suksess**: forvent én vellykket kjøring per periode, og slå alarm når den uteblir. Se i tillegg på alderen til den nyeste kopien og på størrelsen, for et plutselig utslag begge veier er et signal: et fall kan bety at data mangler, og vekst kan bety at data er blitt kryptert av andre enn deg, noe som verken lar seg deduplisere eller komprimere, så inkrementene vokser brått. Det er samme prinsipp som pulsen i [Hvem vokter vokterne? Tilsyn i IT-infrastruktur](/blogg/hvem-vokter-vokterne-i-it-infrastruktur/): stillhet er ikke et svar, og kontrollen skal ikke dele skjebne med det den passer på.

## Hva en gjenoppretting trenger

I sikkerhetskopien: dataene, konfigurasjonen (hvordan systemene ble satt opp, så du kan bygge dem på nytt og ikke bare fylle dem) og hemmelighetene, krypterte og etter reglene over.

Utenfor den ligger et lag null som kommer opp uten noe fra systemet som gjenopprettes: gjenopprettingsveiledningen (trinn for trinn, skrevet for en som er stresset og ikke bygde oppsettet), nøkkelen, verktøyet til å lese formatet og tilgangen til lagringen med kopiene. Det lagres atskilt fra sikkerhetskopien og kan leses uten den. Krever det å lese kopien en agent, en lisensserver eller en konsoll som døde med infrastrukturen eller ikke finnes lenger, er kopien ubrukelig.

Prinsippet er at gjenopprettingsrekkefølgen ikke har sykluser. Nøkkelen i et hemmelighetslager som trenger innloggingstjenesten, som selv må gjenopprettes, er en syklus. Det samme er koden i et arkiv bak den samme innloggingen. Tjenestene alt annet hviler på, som innlogging og navnetjenester, kommer tidlig i rekkefølgen.

Det som bevisst står utenfor, skal stå på en liste, slik at det er et valg og ikke en overraskelse.

## Sjekkliste

- Vi har skrevet ned RPO og RTO og sortert dataene i uerstattelige, reproduserbare og midlertidige.
- For hver hendelse vi må overleve, vet vi hvor mange kopier som er igjen etterpå, og tallet gir den marginen vi har bestemt.
- Det finnes minst tre kopier, originalen medregnet, på minst to ulike slags lagring, og minst én ligger et annet sted. Ingen enkelt leverandør, avtale eller betalingskonto har alle kopiene.
- Ingen enkelthendelse (en feil, en konto, en maskin eller en person) kan slette alle kopiene. Produksjonen kan ikke slette eller overskrive dem, og best er at den ikke har tilgang i det hele tatt.
- Minst én kopi er frakoblet eller uforanderlig, med begrensede skriverettigheter og en grense for hvor mye én kjøring kan legge til.
- Vi har flere versjoner, og oppbevaringen er lengre enn tiden det tar å oppdage et problem.
- Arkivet kontrolleres jevnlig for integritet, og minst én kopi lages direkte fra kilden inn i et separat arkiv, ikke replikert fra samme arkiv.
- Alle kopier er kryptert med nøkler vi selv holder, og nøkkelen er delt eller oppbevart på minst to steder som ikke deler skjebne.
- Sikkerhetskopieringen kjører automatisk, og vi får alarm når en vellykket kjøring uteblir.
- Konfigurasjon og hemmeligheter er med i sikkerhetskopien. Gjenopprettingsveiledningen, nøkkelen, verktøyet til å lese formatet og tilgangen til lagringen ligger utenfor, atskilt og lesbart uten den, og rekkefølgen har ingen sykluser.
- Kopiene er konsistente: relaterte systemer er tatt på ett tidspunkt, eller i en rekkefølge der ingenting peker på et manglende objekt.
- Vi har gjenopprettet fra grunnen, også granulært, tatt tiden og sammenlignet med RTO, og gjentar det på fast tid.

Det siste punktet gjør de andre til mer enn påstander.
