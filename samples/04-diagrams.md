# Architecture and flows

**Purpose:** exercise every diagram type a document is likely to carry

---

## Export pipeline

```mermaid
flowchart LR
    MD[note .md] --> R[Obsidian renderer]
    R --> H[HTML + CSS tokens]
    H --> C[Chromium]
    C --> PDF[(PDF)]
```

## Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant P as Pressmark
    participant E as Electron
    U->>P: clicks export
    P->>P: renders the markdown
    P->>E: printToPDF
    E-->>P: PDF bytes
    P-->>U: file saved
```

## States

```mermaid
stateDiagram-v2
    [*] --> Draft
    Draft --> Review: submit
    Review --> Draft: changes requested
    Review --> Approved: signed off
    Approved --> [*]
```

## Structure

```mermaid
classDiagram
    class ThemePack {
        +string id
        +Tokens tokens
        +Page page
        +resolve()
    }
    ThemePack <|-- Report
    ThemePack <|-- Note
```

## Where the time goes

```mermaid
pie title Export time
    "Markdown render" : 20
    "Chromium layout" : 55
    "Writing the file" : 25
```

## A wide one, on purpose

```mermaid
flowchart LR
    A[Bank notification received] --> B[Signature validation]
    B --> C[Deduplication hash]
    C --> D[Insert with UNIQUE constraint]
    D --> E[Publish event to merchant]
```
