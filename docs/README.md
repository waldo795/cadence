# Cadence — user guide

This is the guide to using Cadence. It explains what each part of the product does, why it
behaves the way it does, and what to watch out for.

The [project README](../README.md) is the developer-facing document — how to run it, how it
is built, what is not finished. This folder is about *using* it.

## Start here

| Guide | What it covers |
| --- | --- |
| [Core ideas](core-ideas.md) | The five concepts everything else is built on. Read this first. |
| [Glossary](glossary.md) | Every term the product uses, in one place. |

## Capabilities

| Guide | What it covers |
| --- | --- |
| [Clients](clients.md) | The client list, attributes, consent, tags and search. |
| [Countdown triggers](countdown-triggers.md) | Date-relative rules that fire events — the heart of the wedding countdown. |
| [Journeys](journeys.md) | Building a journey on the canvas: node types, branches, validation. |
| [Journey instances](journey-instances.md) | How a live journey actually runs, pauses and resumes. |
| [Simulation](simulation.md) | Previewing exactly what a named client would receive. |
| [Contact governance](contact-governance.md) | Caps on how often anyone can be contacted. |
| [Experiments](experiments.md) | Holdouts, variants and lift reporting. |
| [Website enquiry form](website-form.md) | Capturing clients from a public website. |

## Operating it

| Guide | What it covers |
| --- | --- |
| [Designing emails](email-design.md) | Blocks, the shared theme, and the unsubscribe footer. |
| [Sending email](sending-email.md) | Test mode, test profiles and the kill switch — what stands between a journey and someone's inbox. |
| [Privacy requests](privacy-requests.md) | Access and erasure requests: the deadline, the identity check, and what erasure actually removes. |
| [Deploying](deployment.md) | Hosting it for real: what to set, what fails loudly, what to do before real client data goes in. |

## Conventions in these guides

- **Why it works this way** boxes explain decisions that look odd until you know the reason.
  Most of them exist because the obvious alternative causes a real problem.
- **Watch out** boxes flag the things that can bite.
- Anything described as *not built yet* genuinely is not. This guide tries never to describe
  something that does not exist.

## Status

The product is under active development. These guides are written as each capability lands,
so a capability with no guide here has probably not been built. What is definitely missing is
listed in the project README under "what does and does not work".
