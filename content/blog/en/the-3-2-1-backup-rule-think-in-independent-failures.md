---
title: "The 3-2-1 backup rule: think in independent failures"
description: "A backup is judged only by the restore. 3-2-1 is a model of independent failures: each part answers a threat, and you see why the rule looks the way it does."
date: "2026-11-21"
tags: ["Sikkerhet"]
translationOf: "3-2-1-regelen-for-sikkerhetskopiering-tenk-i-uavhengige-feil"
draft: true
---

A backup is judged on one thing: whether you get the data back when you need it. Everything before that is preparation, and anything untested is a claim.

The 3-2-1 rule, commonly attributed to the photographer Peter Krogh, tends to be remembered as three numbers. That is the weakest way to use it. The numbers are shorthand for a model: your copies must not be lost to the same cause. Once you understand the model, you can see why the rule looks the way it does, and when it is not enough.

## The model: independent failures

Everything that can destroy data has a reach. A deleted file affects one file, a dead disk one disk, a fire a whole room. Independence is therefore not yes or no, but relative to a threat: **two copies that can be lost to the same cause are one copy against that cause.** The original and a copy in the same room are one copy against a fire, but two against a dead disk.

So the question to ask is: **for each event I must survive, how many copies are left afterwards?** If the answer is none, you have no protection against that event. If it is one, you have no margin. Decide which events need margin.

## The rule, part by part

| Part | The threat it answers | Without it |
| --- | --- | --- |
| 3 copies of the data, the original included | A second failure while you recover from the first | A failure during the restore leaves you with nothing |
| 2 different kinds of storage | Failures that hit a whole type: the same manufacturing fault, the same wear, the same software bug | One systematic fault takes all the copies at once |
| 1 copy at another site | Events that take a whole place: fire, water, theft, lightning, a power surge | All the copies sit within reach of the same event |

**Why three.** With three copies, a single loss (a dead disk, a deleted file) still leaves two: one to restore from and one in reserve if the restore fails. That matters because the restore is a full read under stress, the first in a long time, which is when latent faults show. Against the loss of a site or a fault in one kind of storage, 3-2-1 guarantees only that one copy survives, with no margin. That is the minimum the rule buys, a choice and not a theorem: data that needs margin there too needs more copies, kinds or sites.

**Why two kinds.** What counts is that the failure modes differ, not the labels. Two disks of the same type, bought and put into service together, wear alike and may share a hidden defect. So do two copies managed by the same software. With three copies on two kinds, two of them share a kind: if a fault of that kind strikes, you are left with one copy and no margin.

**Why another site.** How far away it must be is decided by the event you are guarding against: it has to lie outside the reach of whatever can hit the original. The same room, the same building or the same power circuit means the same fate.

## Decide first what you must survive

Two numbers drive everything else, and they are decisions, not technical details. **RPO** (Recovery Point Objective) is how much data you can afford to lose, measured in time. **RTO** (Recovery Time Objective) is how long you can afford to be down.

RPO sets how often you copy: a copy every night means you can lose up to a day. A low RPO rarely comes from copying everything often, but from a base copy plus a continuous archive of the transaction log. The RPO then depends on the log, not on how often the full copies run. RTO sets the media and the location, because bringing a large volume back over a slow link takes time. A copy that needs a week to come back is a copy against disasters, not against a mistake on a Tuesday. That is why many setups have two tiers: a near, fast copy for everyday errors and a distant one for whatever takes the whole site.

Write the numbers down before choosing a solution, and measure against them later.

Sort the data too, because not everything deserves the full rule and a long history. **Irreplaceable data** gets both. **Reproducible data** needs only what reproduces it: code and configuration, which you do back up. **Temporary data**, such as caches, build output and indexes that can be rebuilt, needs no copy. Without the sorting, both the cost and the RTO explode.

## What is not a backup

Three things look like a backup and are useful, but they answer a different question:

- **RAID and replication** give availability: the service carries on when a disk or a machine drops out. In their usual form they pass every change on within moments, so a deletion, a corrupted file and a wrong overwrite are copied as quickly as everything else. Delayed replication gives a window to stop the error spreading and to recover from the lagging replica, but it still sits in the same administrative domain.
- **Sync** keeps two places identical. Delete a file in one and it disappears from the other. A sync service's version history or trash helps against some mistakes, but it sits in the same administrative domain.
- **Snapshots on the same system** are good for a quick undo, but they sit in the same failure domain: the same hardware, the same file system, the same administrators. If the system goes, the snapshots go with it. They become a copy once they have been copied out.

A simple test: **can one command or one mistake in production remove this copy?** If so, it is not a backup. Passing the test is necessary, not sufficient: the copy must also sit outside the hardware and location domain. Snapshots that production cannot delete still share the hardware.

## Consistency

Copied files are not the same as a consistent state. A database copied at file level while it is running can end up unusable. Related systems can be captured at different times: the database at 02:00 and the file store it refers to at 02:40. Use the database's own consistent dump or snapshot. If related systems keep changing, no order makes them consistent; the order only decides which way they diverge. Capture the system that refers first and the one it refers to afterwards (the database before the file store): then every object the database names exists and the extras are harmless, as long as an object is deleted only after a delay longer than the gap between the two captures, and objects are not overwritten in place.

## Independence is the real rule

Hardware and location are easy to see. The administrative domain is the one that gets forgotten. If every copy can be reached with the same account, the same credentials or from the same admin machine, one fault can delete them all: a compromised machine, an employee having a bad day, a clean-up script with the wrong path. Physically the copies are apart, but administratively they are one.

That means:

- **Separate access.** The backups have their own accounts and credentials. Administering production should not make you an administrator of the copies.
- **Least privilege.** The production side can write new copies but cannot delete or overwrite old ones. Better still, the backup system fetches the data itself with read-only access, so a compromised production side holds no key to the copies. Retention rules are set and enforced there too, not by the system the copies come from.
- **As few common dependencies as possible.** The same password manager or the same management tool is a shared point of failure, however many copies sit behind it.
- **The organisational and contractual domain.** Copies with the same provider, under the same contract, legal entity or payment can share a fate even with separate accounts and immutability: an account closed by mistake or for a breach of terms, data deleted after an unpaid bill, a provider that stops the service. At least one copy should sit outside that domain.
- **Independence in time.** Versions in an incremental or deduplicated chain depend on each other: one damaged base block or a damaged repository index can take every later version. A log chain is the extreme case: one missing log segment ends the restore at that point, even if the base copy is intact. The remedies: check the integrity of the repository itself regularly, take independent full copies at intervals, and make at least one copy directly from the source into a separate repository, not replicated from the same repository, because replicating it copies the damage.

## 3-2-1-1-0

The extended form adds two parts that answer two failures the simple rule does not cover.

**+1: a copy that is offline or immutable.** This is a property, not necessarily a fourth copy: it can be one of the three, often the off-site one, and it adds no margin by itself. An offline copy is physically disconnected except while it is being written, so nothing running on the network can reach it. An immutable copy can be written only once and is kept for a fixed time that nobody can shorten, not even an administrator. The guarantee holds only if the storage itself enforces the lock, not a setting that the same credentials can change. This covers deletion and encryption carried out with legitimate access, and faults in the automation. The cost is that you cannot clear the copy away until the time is up, and that the reverse can happen too: whoever can write can fill immutable storage with junk that nobody can delete, so the quota fills and new copies stop, or the bill grows until the account is closed. Limit the write rights, and cap how much one run, or one period, may add, so that a run far beyond normal stops and raises an alarm before the storage fills. A quota alone only protects the budget. The same cap catches a pulled copy of junk or ciphertext from a compromised source.

**0: zero errors in verified restores.** ‘The job reported success’ is not a measure. The measure is a restore that was read back and compared, and that produced zero errors.

## Versions and retention

A backup that overwrites yesterday's copy with today's is a mirror with a delay: corrupted data is copied on the next run. You need history. The usual pattern is tiers that thin out with age: daily copies for the last few weeks, weekly for the months, monthly further back.

The number to compare against is how long it takes you to notice a problem. If silent corruption starts in March, you notice in May and you keep six weeks, no intact version exists. **If the time to detect a problem is longer than the retention, the data is lost.** Retention must therefore exceed the longest detection time you can realistically expect.

It also has an upper limit: some data must be deleted after a time, and deletion must sooner or later reach the copies too. Immutability and required deletion have to be reconciled by design. Either the immutability window is no longer than the time within which deletion must happen, or you encrypt data sets with separate keys and delete the key (cryptographic erasure), including the escrowed copies of it. That works only at coarse granularity (per customer, data set or period), and it moves the problem to the key store, which needs its own design: it must survive as well as the data does, yet still allow keys to be deleted.

## Encryption

Encrypt every copy. For copies that leave your control, at another site, with another party or on media that are moved, it is non-negotiable, and it is done on your side, before the data leaves you, with keys you hold yourself. Encryption at rest with the provider's keys protects neither against a compromised account nor against the provider. The channel is encrypted in transit too. Remember that every copy is also a copy for a thief: more copies widen the attack surface, and a backup protects availability and integrity, not against data that has been stolen.

The price is that the key becomes a single point of failure for every copy. Two rules follow. The key must never live only inside the backup it unlocks, or you need the copy to open the copy. And it must never live only on the system that can die. Keep it separately, in at least two places that do not share a fate, ideally including a sealed paper copy somewhere else. Better still, split it into shares held by different people or places, so that no single share opens the data and losing one share does not stop the restore (M of N). Test that a person who did not build the setup can get to it.

The restore decides whether you have a backup. Encryption decides whether the backup becomes a threat itself.

## What a restore needs

In the backup: the data, the configuration (how the systems were set up, so that you can rebuild them and not merely refill them) and the secrets, encrypted and following the rules above.

Outside it sits a layer zero that comes up with nothing from the system being restored: the restore runbook (step by step, written for someone who is stressed and did not build the setup), the key, the tool to read the format and the access to the backup storage. It is stored separately from the backup and readable without it. If reading the copy needs an agent, a licence server or a console that died with the infrastructure or no longer exists, the copy is useless.

The principle is that the restore order has no cycles. The key in a secrets manager that needs the sign-in service, which itself has to be restored, is a cycle. So is code in a repository behind that same sign-in. The services everything rests on, such as sign-in and name services, come early in the order.

What is deliberately left out belongs on a list, so that it is a choice and not a surprise.

## The restore drill

An untested backup is a hypothesis. Backups fail silently: the wrong path, files that are missing, a job that ‘succeeds’ in copying an empty folder, a format that needs software you no longer have, a damaged medium. None of this shows until you restore.

- **Spot checks, often.** Restore a few random files and check the contents. It is cheap, so do it regularly.
- **A full restore, on a schedule.** Start from clean equipment with only the copy and what layer zero holds (see above): the key, the runbook, the tool and the access to the storage. Time it and compare with the RTO. Many people find out here that the RTO was a wish.
- **Integrity.** Store checksums when the copy is made, and verify them on reading and at intervals, so that silent bit rot in a stored copy is found before you need it. For a database, restoring means that it starts and passes its own consistency check.
- **A granular restore.** One table, one customer, one object from a given day, without rolling back everyone else's work. A whole-system image can pass the full-restore test and still fail this.

Layer zero rots silently: an expired token, a second factor tied to someone who left, a tool that no longer runs, a sealed key from before the last rotation. The drill is what finds it, and what surprised you goes into the runbook.

## After a break-in

Do not restore whole system images, because you would restore the intruder too. Rebuild the systems from configuration and code, restore only data, from a point before the intrusion, and treat it as suspect. That requires a clean version to still exist: intrusions are often found late, so they count among the problems retention must outlast (see above).

## Automation and monitoring

Manual backups stop happening: a busy week, a forgotten routine, a person who has left. Automate the schedule, the verification and the clean-up after the retention period.

But automation fails silently too, and an alert on failure is not enough, because a job that never starts sends no error. Alert on the **absence of a success**: expect one successful run of each scheduled job, the copy and the verification alike, per period, and raise the alarm when one does not arrive. Also watch the age of the newest copy and its size, since a sudden change in either direction is a signal: a drop can mean data is missing, and growth can mean data encrypted by someone other than you, which can be neither deduplicated nor compressed, so the increments balloon. It is the same principle as the pulse in [Who watches the watchers? Oversight in IT infrastructure](/en/blog/who-watches-the-watchers-oversight-in-it-infrastructure/): silence is not an answer, and the check must not share a fate with the thing it watches.

## Checklist

- We have written down the RPO and the RTO, and sorted the data into irreplaceable, reproducible and temporary.
- For each event we must survive, we know how many copies are left afterwards, and that number meets the margin we decided on.
- There are at least three copies, the original included, on at least two different kinds of storage, and at least one is at another site. No single provider, contract or payment account holds every copy.
- No single event (a fault, an account, a machine or a person) can delete all the copies. Production cannot delete or overwrite them, and better still, it has no access to them at all.
- At least one copy is offline or immutable, with limited write rights and a cap on how much one run, or one period, may add.
- We keep several versions, and the retention is longer than the time it takes to notice a problem.
- The repository is checked for integrity regularly, and at least one copy is made directly from the source into a separate repository, not replicated from the same repository.
- Every copy is encrypted with keys we hold, and the key is split or kept in at least two places that do not share a fate.
- The copying and the verification run automatically, and we get an alarm when a successful run of either fails to arrive.
- Configuration and secrets are in the backup. The runbook, the key, the tool to read the format and the access to the storage sit outside it, stored separately and readable without it, and the restore order has no cycles.
- The copies are consistent: related systems are captured at one point in time, or in an order where nothing points to a missing object.
- We have restored from scratch, granularly too, timed it against the RTO, and repeat it on a schedule.

The last item is what turns the others into more than claims.
