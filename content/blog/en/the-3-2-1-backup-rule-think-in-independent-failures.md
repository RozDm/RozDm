---
title: "The 3-2-1 backup rule: think in independent failures"
description: "A backup is judged only by the restore. 3-2-1 is a model of independent failures: each part answers a threat, and you can derive it yourself."
date: "2026-11-21"
tags: ["Sikkerhet", "SRE"]
translationOf: "3-2-1-regelen-for-sikkerhetskopiering-tenk-i-uavhengige-feil"
draft: true
---

A backup is judged on one thing: whether you get the data back when you need it. Everything before that is preparation, and anything untested is a claim.

The 3-2-1 rule, commonly attributed to the photographer Peter Krogh, tends to be remembered as three numbers. That is the weakest way to use it. The numbers are shorthand for a model: your copies must not be lost to the same cause. Once you understand the model you can derive the rule yourself, and you can see when it is not enough.

## The model: independent failures

Everything that can destroy data has a reach. A deleted file affects one file, a dead disk affects one disk, a fire affects a whole room. A copy protects against a failure only if it sits outside that failure's reach. Two copies that can be lost to the same cause are, in practice, one.

So the question to put to every pair of copies is: **which single event takes both?** If there is an answer, they share a failure domain, and you have fewer copies than you think.

## The rule, part by part

| Part | The threat it answers | Without it |
| --- | --- | --- |
| 3 copies of the data, the original included | A single failure: a deleted file, a dead disk, a software bug | One failure and everything is gone |
| 2 different kinds of storage | Failures that hit a whole type: the same manufacturing fault, the same wear, the same software bug | One systematic fault takes both copies at once |
| 1 copy at another site | Events that take a whole place: fire, water, theft, a power failure | All the copies sit within reach of the same event |

**Why three.** With only two copies, the restore is the most dangerous moment: the original is gone and the one copy is used for the first time. If it fails then, you have nothing. Three is the lowest number where one loss, and another during the restore, still leaves a copy.

**Why two kinds.** What counts is that the failure modes differ, not that the labels do. Two disks of the same type, bought and put into service together, wear alike and may share a hidden defect. So do two copies managed by the same software. ‘Different kinds’ means one fault is not the other's fault.

**Why another site.** How far away it must be is decided by the event you are guarding against: it has to lie outside the reach of whatever can hit the original. A copy in the same room, the same building or on the same power circuit shares the original's fate.

## Decide first what you must survive

Two numbers drive everything else, and they are decisions, not technical details. **RPO** is how much data you can afford to lose, measured in time. **RTO** is how long you can afford to be down.

RPO sets how often you copy: a copy every night means you can lose up to a day. RTO sets the media and the location, because bringing a large volume back over a slow link takes time. A copy that needs a week to come back is a copy against disasters, not against a mistake on a Tuesday. That is why many setups have two tiers: a near, fast copy for everyday errors and a distant one for whatever takes the whole site.

Write the numbers down before choosing a solution, and measure against them later.

## What is not a backup

Three things look like a backup and are useful, but they answer a different question:

- **RAID and replication** give availability: the service carries on when a disk or a machine drops out. They write the same thing to every copy immediately, so a deletion, a corrupted file and a wrong overwrite are copied as quickly as everything else.
- **Sync** keeps two places identical. Delete a file in one and it disappears from the other. It is two views of the same data.
- **Snapshots on the same system** are good for a quick undo, but they sit in the same failure domain: the same hardware, the same file system, the same administrators. If the system goes, the snapshots go with it. They become a copy once they have been copied out.

A simple test: **can one command or one mistake in production remove this copy?** If so, it is not a backup.

## Independence is the real rule

Hardware and location are easy to see. The administrative domain is the one that gets forgotten. If every copy can be reached with the same account, the same credentials or from the same admin machine, one fault can delete them all: a compromised machine, an employee having a bad day, a clean-up script with the wrong path. Physically the copies are apart, but administratively they are one.

That means:

- **Separate access.** The backups have their own accounts and credentials. Administering production should not make you an administrator of the copies.
- **Least privilege.** The production side can write new copies but cannot delete or overwrite old ones. Better still, the backup system fetches the data itself with read access, so a compromised production side holds no key to the copies.
- **Retention rules set from the copy side.** How long the copies live is decided there, not by the system they came from.
- **As few shared parts as possible.** The same account at the same provider, the same password manager or the same management tool is a common cause, however many copies sit behind it.

## 3-2-1-1-0

The extended form adds two parts that answer two failures the simple rule does not cover.

**+1: a copy that is offline or immutable.** An offline copy is physically disconnected except while it is being written, so nothing running on the network can reach it. An immutable copy can be written only once and is kept for a fixed time that nobody can shorten, not even an administrator. The guarantee holds only if the storage itself enforces the lock, not a setting that the same credentials can change. This covers deletion and encryption carried out with legitimate access, and faults in the automation. The cost is that you cannot clear the copy away until the time is up.

**0: zero errors in verified restores.** ‘The job reported success’ is not a measure. The measure is a restore that was read back and compared, and that produced zero errors.

## Versions and retention

A backup that overwrites yesterday's copy with today's is a mirror with a delay: corrupted data is copied on the next run. You need history. The usual pattern is tiers that thin out with age: daily copies for the last few weeks, weekly for the months, monthly further back. That keeps the cost bounded.

The number to compare against is how long it takes you to notice a problem. If silent corruption starts in March, you notice in May and you keep six weeks, no intact version exists. **If the time to detect a problem is longer than the retention, the data is lost.** Retention must therefore exceed the longest detection time you can imagine. It also has an upper limit: some data must be deleted after a time, and deletion must sooner or later reach the copies too, through the expiry of the retention.

## Encryption

A copy is an extra copy of everything, and you often guard it less well than the original. Copies that leave your control, at another site, with another party or on media that are moved, must be encrypted both in transit and at rest. Otherwise whoever gets hold of the copy gets all the data.

The price is that the key becomes a single point of failure for every copy. Two rules follow. The key must never live only inside the backup it unlocks, or you need the copy to open the copy. And it must never live only on the system that can die. Keep it separately, in at least two places that do not share a fate, ideally including a sealed paper copy somewhere else. Test that a person who did not build the setup can get to it.

## The restore drill

An untested backup is a hypothesis. Backups fail silently: the wrong path, files that are missing, a job that ‘succeeds’ in copying an empty folder, a format that needs software you no longer have, a damaged medium. None of this shows until you restore.

- **Spot checks, often.** Restore a few random files and check the contents. It is cheap, so do it regularly.
- **A full restore, on a schedule.** Start from clean equipment with only what a disaster leaves you: the copy, the key and the runbook. Time it and compare with the RTO. Many people find out here that the RTO was a wish.
- **Integrity.** Store checksums when the copy is made, and verify them on reading and at intervals, so that silent bit rot in a stored copy is found before you need it. For a database, restoring means that it starts and passes its own consistency check.

What surprised you goes into the runbook.

## Automation and monitoring

Manual backups stop happening: a busy week, a forgotten routine, a person who has left. Automate the schedule, the verification and the clean-up after the retention period.

But automation fails silently too, and an alert on failure is not enough, because a job that never starts sends no error. Alert on the **absence of a success**: expect one successful run per period and raise the alarm when it does not arrive. Also watch the age of the newest copy and its size, since a sudden drop in size is a signal. It is the same principle as the pulse in [Who watches the watchers? Oversight in IT infrastructure](/en/blog/who-watches-the-watchers-oversight-in-it-infrastructure/): silence is not an answer, and the check must not share a fate with the thing it watches.

## What to include

Not only the data:

- **Configuration:** how the systems were set up, so that you can rebuild them and not merely refill them.
- **Secrets and keys**, encrypted and following the rules above.
- **The restore runbook:** step by step, written for someone who is stressed and did not build the setup. It and the keys must survive the disaster. If they live only on the system that failed, you cannot reach them when you need them.
- **The services everything else rests on,** such as sign-in and name services.

And take the copy in a way that gives a consistent point in time: a file copied while it is changing can end up unusable. What is deliberately left out belongs on a list, so that it is a choice and not a surprise.

## Checklist

- We have written down the RPO and the RTO.
- There are at least three copies, the original included.
- They sit on at least two different kinds of storage.
- At least one copy is at another site, outside the reach of the same event.
- No single event (a fault, an account, a machine or a person) can delete all the copies. Production can write but not delete.
- At least one copy is offline or immutable.
- We keep several versions, and the retention is longer than the time it takes to notice a problem.
- Copies outside our control are encrypted, and the key is kept separately, on paper too.
- The backup runs automatically, and we get an alarm when a successful run fails to arrive.
- Configuration, secrets and the restore runbook are included, and kept outside the system that can fail.
- We have restored from scratch, timed it against the RTO, and repeat it on a schedule.

The last item is what turns the others into more than claims.
