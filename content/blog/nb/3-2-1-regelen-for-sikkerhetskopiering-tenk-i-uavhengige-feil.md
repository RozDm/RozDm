---
title: "3-2-1-regelen for sikkerhetskopiering: tenk i uavhengige feil"
description: "En sikkerhetskopi bedømmes bare på gjenopprettingen. 3-2-1 er en modell for uavhengige feil: hver del svarer på en trussel, og du kan utlede den selv."
date: "2026-11-21"
tags: ["Sikkerhet", "SRE"]
draft: true
---

En sikkerhetskopi bedømmes på én ting: om du får dataene tilbake når du trenger dem. Alt før det er forberedelse, og alt som ikke er prøvd, er en påstand.

3-2-1-regelen, som ofte tilskrives fotografen Peter Krogh, blir gjerne husket som tre tall. Det er den svakeste måten å bruke den på. Tallene er en kortform av en modell: kopiene dine skal ikke kunne gå tapt av samme årsak. Forstår du modellen, kan du utlede regelen selv, og du ser når den ikke er nok.

## Modellen: uavhengige feil

Alt som kan ødelegge data, har en rekkevidde. En slettet fil rammer én fil, en død disk rammer én disk, en brann rammer et helt rom. En kopi beskytter mot en feil bare hvis den ligger utenfor feilens rekkevidde. To kopier som kan tapes av samme årsak, er i praksis én.

Spørsmålet å stille til hvert par av kopier er derfor: **hvilken enkelthendelse tar begge?** Finnes det et svar, deler de feildomene, og du har færre kopier enn du tror.

## Regelen, del for del

| Del | Trusselen den svarer på | Uten den |
| --- | --- | --- |
| 3 kopier av dataene, originalen medregnet | En enkelt feil: en slettet fil, en død disk, en programfeil | Én feil, og alt er borte |
| 2 ulike slags lagring | Feil som rammer en hel type: samme produksjonsfeil, samme slitasje, samme programfeil | Én systematisk feil tar begge kopiene samtidig |
| 1 kopi på et annet sted | Hendelser som tar et helt sted: brann, vann, tyveri, strømbrudd | Alle kopiene står innenfor samme hendelse |

**Hvorfor tre.** Med bare to kopier er gjenopprettingen det farligste øyeblikket: originalen er borte, og den ene kopien brukes for første gang. Svikter den da, har du ingenting. Tre er det laveste tallet der ett tap, og ett til under gjenopprettingen, fortsatt etterlater en kopi.

**Hvorfor to slags.** Det som teller, er at feilmåtene er ulike, ikke at merkelappene er det. To disker av samme type, kjøpt og tatt i bruk sammen, slites likt og kan ha samme skjulte feil. Det samme gjelder to kopier som styres av samme programvare. Ulike slags betyr at den ene feilen ikke er den andres.

**Hvorfor ett annet sted.** Hvor langt unna det må være, avgjøres av hendelsen du verner mot: det må ligge utenfor rekkevidden til det som kan ramme originalen. En kopi i samme rom, samme bygg eller på samme strømkurs har samme skjebne som originalen.

## Bestem først hva du må tåle

To tall styrer resten, og de er avgjørelser, ikke tekniske detaljer. **RPO** er hvor mye data du tåler å miste, målt i tid. **RTO** er hvor lenge du tåler å være nede.

RPO bestemmer hvor ofte du kopierer: en kopi hver natt betyr at du kan miste opptil et døgn. RTO bestemmer medier og plassering, for det tar tid å hente tilbake store datamengder over en langsom linje. En kopi som trenger en uke for å komme tilbake, er en kopi mot katastrofer, ikke mot en feil på en tirsdag. Derfor har mange to nivåer: en nær og rask kopi for hverdagens feil, og en fjern kopi for det som tar hele stedet.

Skriv tallene ned før du velger løsning, og mål mot dem senere.

## Det som ikke er en sikkerhetskopi

Tre ting ligner på en sikkerhetskopi, og er nyttige, men svarer på et annet spørsmål:

- **RAID og replikering** gir tilgjengelighet: tjenesten går videre når en disk eller en maskin faller ut. De skriver det samme til alle kopiene umiddelbart, så en sletting, en ødelagt fil og en feilaktig overskriving blir kopiert like raskt som alt annet.
- **Synkronisering** holder to steder like. Slett en fil på det ene, og den forsvinner fra det andre. Det er to visninger av samme data.
- **Øyeblikksbilder på samme system** er gode til rask angring, men ligger i samme feildomene: samme maskinvare, samme filsystem, samme administratorer. Faller systemet, faller bildene med det. De blir først en kopi når de er kopiert ut.

En enkel test: **kan én kommando eller én feil i produksjon fjerne denne kopien?** Hvis ja, er den ikke en sikkerhetskopi.

## Uavhengighet er den egentlige regelen

Maskinvare og sted er lette å se. Det administrative domenet glemmes. Er alle kopiene tilgjengelige med samme konto, samme legitimasjon eller fra samme administrasjonsmaskin, kan én feil slette dem alle: en kompromittert maskin, en ansatt med dårlig dag, et opprydningsskript med feil sti. Fysisk er kopiene atskilt, men administrativt er de én.

Det betyr:

- **Adskilt tilgang.** Sikkerhetskopiene har egne kontoer og egen legitimasjon. At du administrerer produksjonen, skal ikke gjøre deg til administrator av kopiene.
- **Minste privilegium.** Produksjonssiden kan skrive nye kopier, men ikke slette eller overskrive de gamle. Best er at sikkerhetskopisystemet henter dataene selv med lesetilgang, så en overtatt produksjon ikke har noen nøkkel til kopiene.
- **Oppbevaringsregler fra kopisiden.** Hvor lenge kopiene lever, bestemmes der, ikke av systemet de kommer fra.
- **Færrest mulig delte deler.** Samme konto hos samme leverandør, samme passordbehandler eller samme administrasjonsverktøy er en felles årsak, uansett hvor mange kopier som ligger bak.

## 3-2-1-1-0

Utvidelsen legger til to ledd som svarer på to feil den enkle regelen ikke dekker.

**+1: en kopi som er frakoblet eller uforanderlig.** En frakoblet kopi er fysisk atskilt, bortsett fra mens den skrives, så ingenting som kjører i nettet kan nå den. En uforanderlig kopi kan bare skrives én gang og beholdes en fastsatt tid som ingen kan korte ned, heller ikke en administrator. Garantien gjelder bare hvis lagringen selv håndhever låsen, ikke en innstilling som samme legitimasjon kan endre. Dette dekker sletting og kryptering utført med lovlig tilgang, og feil i automatikken. Prisen er at du ikke kan rydde bort kopien før tiden er ute.

**0: null feil i verifiserte gjenopprettinger.** «Jobben meldte suksess» er ikke et mål. Målet er at en gjenoppretting er lest tilbake og sammenlignet, og at den ga null feil.

## Versjoner og oppbevaringstid

En sikkerhetskopi som overskriver gårsdagens med dagens, er et speil med litt forsinkelse: ødelagte data blir kopiert ved neste kjøring. Du trenger historikk. Vanlig er nivåer som tynnes ut med alderen: daglige kopier for de siste ukene, ukentlige for månedene, månedlige for lenger tilbake. Slik holder kostnaden seg avgrenset.

Tallet å sammenligne med, er hvor lang tid det tar før du oppdager et problem. Begynner stille ødeleggelse i mars og du merker det i mai, og du beholder seks uker, finnes det ingen hel versjon. **Er tiden til oppdagelse lengre enn oppbevaringstiden, er dataene tapt.** Oppbevaringen må derfor overstige den lengste oppdagelsestiden du kan tenke deg. Samtidig har den en øvre grense: noen data skal slettes etter en tid, og sletting må før eller siden nå også kopiene, gjennom utløpet av oppbevaringen.

## Kryptering

En kopi er en ekstra kopi av alt, og ofte vokter du den dårligere enn originalen. Kopier som forlater din kontroll, på et annet sted, hos andre eller på medier som flyttes, må krypteres både under overføring og i ro. Ellers får den som får tak i kopien, alle dataene.

Prisen er at nøkkelen blir en enkeltfeil for alle kopiene. Da gjelder to regler. Nøkkelen skal aldri bare ligge i sikkerhetskopien den låser opp, for da trenger du kopien for å åpne kopien. Og den skal aldri bare ligge på systemet som kan dø. Oppbevar den separat, på minst to steder som ikke deler skjebne, gjerne en forseglet papirkopi et annet sted. Test at en person som ikke har bygget oppsettet, kan komme til den.

## Gjenopprettingsprøven

En sikkerhetskopi som ikke er prøvd, er en hypotese. Sikkerhetskopier svikter stille: feil sti, filer som mangler, en jobb som «lykkes» med å kopiere en tom mappe, et format som krever programvare du ikke lenger har, et medium som er ødelagt. Ingenting av dette viser seg før du gjenoppretter.

- **Stikkprøver, ofte.** Gjenopprett noen tilfeldige filer, og sjekk innholdet. Det er billig, så gjør det jevnlig.
- **Full gjenoppretting, på fast tid.** Start fra rent utstyr med bare det en katastrofe lar deg beholde: kopien, nøkkelen og veiledningen. Ta tiden og sammenlign med RTO. Mange oppdager her at RTO var et ønske.
- **Integritet.** Lagre sjekksummer når kopien lages, og kontroller dem ved lesing og med jevne mellomrom, slik at stille datarot i en lagret kopi oppdages før du trenger den. For en database betyr gjenoppretting at den starter og består sin egen konsistenssjekk.

Det som overrasket deg, rettes i veiledningen.

## Automatisering og overvåking

Manuelle sikkerhetskopier slutter å bli tatt: en travel uke, en glemt rutine, en person som har sluttet. Automatiser tidsplan, kontroll og oppryddingen etter oppbevaringstiden.

Men automatikk svikter også stille, og et varsel om feil er ikke nok, for en jobb som aldri starter, sender ingen feilmelding. Varsle på **fravær av suksess**: forvent én vellykket kjøring per periode, og slå alarm når den uteblir. Se i tillegg på alderen til den nyeste kopien og på størrelsen, for et brått fall i størrelse er et signal. Det er samme prinsipp som pulsen i [Hvem vokter vokterne? Tilsyn i IT-infrastruktur](/blogg/hvem-vokter-vokterne-i-it-infrastruktur/): stillhet er ikke et svar, og kontrollen skal ikke dele skjebne med det den passer på.

## Hva som skal med

Ikke bare dataene:

- **Konfigurasjon:** hvordan systemene ble satt opp, så du kan bygge dem på nytt og ikke bare fylle dem.
- **Hemmeligheter og nøkler**, krypterte og etter reglene over.
- **Gjenopprettingsveiledningen:** trinn for trinn, skrevet for en som er stresset og ikke bygde oppsettet. Den og nøklene må overleve katastrofen. Ligger de bare på systemet som sviktet, kommer du ikke til dem når du trenger dem.
- **Tjenestene alt annet hviler på,** som innlogging og navnetjenester.

Og ta kopien på en måte som gir et konsistent tidspunkt: en fil som kopieres mens den endres, kan bli ubrukelig. Det som bevisst står utenfor, skal stå på en liste, slik at det er et valg og ikke en overraskelse.

## Sjekkliste

- Vi har skrevet ned RPO og RTO.
- Det finnes minst tre kopier, originalen medregnet.
- De ligger på minst to ulike slags lagring.
- Minst én kopi ligger et annet sted, utenfor rekkevidde av samme hendelse.
- Ingen enkelthendelse (en feil, en konto, en maskin eller en person) kan slette alle kopiene. Produksjonen kan skrive, men ikke slette.
- Minst én kopi er frakoblet eller uforanderlig.
- Vi har flere versjoner, og oppbevaringen er lengre enn tiden det tar å oppdage et problem.
- Kopier utenfor vår kontroll er kryptert, og nøkkelen er oppbevart separat, også på papir.
- Sikkerhetskopieringen kjører automatisk, og vi får alarm når en vellykket kjøring uteblir.
- Konfigurasjon, hemmeligheter og gjenopprettingsveiledning er med, og ligger utenfor systemet som kan svikte.
- Vi har gjenopprettet fra grunnen, tatt tiden og sammenlignet med RTO, og gjentar det på fast tid.

Det siste punktet gjør de andre til mer enn påstander.
