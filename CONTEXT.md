# QH

QH is a terminal workspace for organizing persistent shell sessions across tabs, panes, and workspaces.

## Language

**Workspace**: A named collection of tabs, with its own selected tab and tab groups.

**Tab**: A named arrangement of panes within a workspace.

**Pane**: A place in a tab's split layout that displays one shell session.

**Session**: A shell process and its terminal state. Moving or hiding its pane preserves the session.

**Workspace interaction**: An action that changes a workspace or operates on its sessions, including the validation and confirmation needed before applying it.

**Command prefix**: Ctrl+B followed by a workspace command. Ordinary shell input remains shell input until this prefix is used.
