# Designing emails

How an email is built, how it is styled, and why it is a list of blocks
rather than a box of HTML.

See [Sending email](sending-email.md) for whether it actually goes out.

---

## Two separate jobs

| Where | Decides |
| --- | --- |
| **The send node**, in a journey | What this email *says* — the words, the images, the links. |
| **Settings → Email design** | What every email *looks like* — logo, colours, type, footer. |

Changing the design changes every journey at once, including ones already
running. That is the point: five countdown emails should look like they came
from the same business without anyone styling them five times.

---

## The designer

Select a Send Email node and click **Design email**. The designer opens
full-screen: blocks down the left, the actual rendered email down the right.

The preview runs the same renderer and the same merge-field resolution as a
live send, against a client you pick from the dropdown. So "One week to go,
{{profile.firstName}}" shows as "One week to go, Ava", with Ava's real venue
and date — and if a field cannot be filled in for her, a warning names it
while you type rather than after you send yourself a test.

A desktop / phone toggle switches the preview width. Most brides read on a
phone.

> **Why it works this way**
>
> It is a separate window rather than part of the properties panel because an
> email is 600px wide and the panel is under half that. Editing blocks in the
> sidebar meant never seeing what you were making — the loop was save, switch
> to test mode, send yourself one, check your inbox, go back.

> **Watch out**
>
> The preview's unsubscribe link is a placeholder. The real one is built per
> client at send time, so it cannot be clicked from here.

## Blocks

A body is a list of blocks.

| Block | Notes |
| --- | --- |
| **Paragraph** | Body copy. A blank line starts a new paragraph. |
| **Heading** | Title (once, at the top) or Section. |
| **Image** | Needs a public URL and a description. |
| **Button** | A label and a link. |
| **Divider** | A horizontal rule. |
| **Space** | Small, medium or large gap. |

Merge fields work in every one of them, including a button's link —
`https://example.com/{{profile.id}}` resolves per client.

> **Why it works this way**
>
> Blocks rather than an HTML editor, for three reasons. The simulator can
> still see each merge field, so it can tell you which ones will not resolve
> for a named client. The same content renders to HTML *and* a plain-text
> part without parsing anything back out. And the person writing the email is
> choosing between six things instead of editing markup.

> **Watch out**
>
> A button with no link is left out of the email entirely, rather than
> rendered as something that cannot be clicked. The editor warns you while
> the link is empty.

### Nothing needed migrating

A send node authored before the editor existed has only its original plain
text. Its blocks are derived from that text on the fly, splitting on blank
lines — which is the structure it was already written in. Opening the editor
changes nothing; the first edit saves the conversion.

The plain-text body is kept in step with the blocks, because it is still the
text part of every send.

---

## The design

**Settings → Email design.** Business name, logo, typeface, five colours, and
the footer. The preview beside the fields uses the real renderer with sample
copy; the designer previews the same theme against a real client.

> **Why it works this way**
>
> Email HTML is not web HTML. Outlook on Windows renders with Word's engine:
> no flexbox, no grid, external stylesheets stripped. Everything here is
> tables and inline styles, which looks archaic and is the only thing that
> works everywhere.
>
> Typefaces are system stacks only. Outlook and Gmail strip `@font-face` and
> fall back to Times, which looks worse than choosing a good stack.

> **Watch out**
>
> Most email clients block images until the reader allows them. The logo's
> alt text is your business name, and an image block's description is what
> most people see first — write it as if the picture never loads, because for
> many of them it will not.

---

## Unresolved merge fields stop a live send

If a field cannot be filled in for a particular client, `{{profile.venue}}`
appears in the email exactly as written. The simulator flags this; so does
the sender.

- **Live:** the send is **blocked** and recorded with the field named. A
  visibly broken email to a bride the week of her wedding is worse than a
  missing one somebody can chase.
- **Test:** the send goes through, braces and all. Seeing the break is the
  whole point of a test.

---

## Unsubscribe

Every marketing email gets an unsubscribe link in the footer automatically.
It cannot be turned off — it is legally required in the UK, and burying it
costs more in spam complaints than it saves in unsubscribes.

The link carries an HMAC of the client's id, so it opts out exactly one
person and cannot be edited into someone else's. It never expires: a dead
link in a year-old email leaves a spam complaint as the only way to stop the
mail, which costs the sending domain far more.

Clicking it opens a page with a confirmation button. It does **not**
unsubscribe on load, because inbox providers and corporate mail scanners
follow every link in a message to check it is safe — a link that acted on
GET would opt people out of emails they never opened.

Unsubscribing sets email consent to `unsubscribed`, which the policy
evaluator already honours everywhere.

> **Watch out**
>
> Links need `APP_URL` (or Railway's own domain) to be set. Without it,
> emails go out with **no unsubscribe link at all**, which is unlawful for
> marketing. Set it before going live.

---

## Columns

Drag a layout from the palette for a row split into two, three, or an uneven
pair. Each column holds its own blocks, and you drag content into them the
same way.

Columns sit side by side on a desktop and stack on a phone.

> **Why it works this way**
>
> One level deep only. Columns inside columns is where email layout stops
> being predictable across clients, and it is not a layout any message to a
> bride needs.
>
> Stacking is the one thing in the whole email that needs a stylesheet — there
> is no inline equivalent for a media query. Outlook on Windows ignores it and
> leaves the columns side by side, which is the right outcome on a desktop
> screen anyway. Everything else stays inline, because Gmail strips `<style>`
> in some clipping and forwarding cases and the layout has to survive that.

> **Watch out**
>
> Changing a row from three columns to two moves whatever was in the third
> into the last remaining column rather than deleting it. Nothing is lost to a
> mis-click, but things can end up somewhere you did not expect.

---

## Personalisation fields

The `{{ }}` button beside any text field lists what can be merged in. The list
is built from your actual data, not a fixed set:

- **Client** — the fields every client record has.
- **Client details** — whatever has been recorded beyond those: wedding date,
  venue, package, trial date. Discovered across your client list, so it grows
  as you record more.
- **This journey's trigger** — the payload the event that starts this journey
  actually carries, taken from the declared template *and* from real events of
  that name, because a template can fall behind what is really being sent.
- **Journey** — the name and version of the journey sending it.

Each field shows a real value beside it, because the name does not tell you
whether `readyByTime` holds "07:30" or "Undecided".

> **Watch out**
>
> A warning triangle and a count like `6/9` means the field is missing for
> some clients. Using it is not wrong — but those clients will have a live
> send blocked until it is filled in or the field is removed.

---

## Templates

**Templates** in the sidebar holds emails built once and reused. Build one
there in the full designer, or save one from inside a journey with **Save as
template**. Pick one up with the **Templates** button in the designer.

> **Why it works this way**
>
> Both directions copy; nothing stays linked. A template that remained bound
> to the journeys using it would mean editing the welcome email silently
> rewrote the night-before one — a surprise you would discover by sending it.

A template belongs to no journey, so the field picker there offers the union
of every trigger's payload and marks how widely each field is carried. Not
every field will be available to every journey that uses the template.

---

## Looks for particular clients

**Settings → Email design → Looks for particular clients.** A look replaces
part of the design when a condition matches — a different hero image and
background for a winter wedding, say, or for a particular package.

Looks are checked in order and **the first match wins**; the rest are ignored.
Anything a look does not set falls through to the design above it.

Values can also hold merge fields, so `{{profile.heroImage}}` works where the
URL is on the client record. That resolves *after* a look is applied, so a
merge field inside a look works too.

The preview in Settings, and the one in the designer, both show the look that
applies to the client you have selected, named in the corner. A look you
cannot see applying to anyone is usually a condition that never matches.

> **Watch out**
>
> A look can change the hero image and the colours, and nothing else. It
> deliberately cannot touch the footer — one client seeing different business
> details from another is not a design choice worth enabling.
