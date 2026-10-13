ZDOTDIR=$_qentrah_user_dotdir
[[ -r $ZDOTDIR/.zlogin ]] && source "$ZDOTDIR/.zlogin"
# Keep bundled qh and its Node runtime available even when user dotfiles reset PATH.
if [[ -n $QESH_BIN_PATH && -d $QESH_BIN_PATH ]]; then
  typeset -U path
  path=("$QESH_BIN_PATH" "$QESH_RUNTIME_PATH" $path)
fi
# This customization is scoped to Qentrah sessions. Keep an opt-out for existing prompts.
if [[ ${QENTRAH_SHELL_STYLE:-clean} != original ]]; then
  _qentrah_clean_prompt() {
    PROMPT='%F{#9cdcfe}%1~%f %F{#a09ca8}❯%f '
    RPROMPT=''
  }
  autoload -Uz add-zsh-hook
  add-zsh-hook precmd _qentrah_clean_prompt
  _qentrah_clean_prompt
  if (( ! $+functions[_zsh_highlight] )); then
    source "$_qentrah_wrapper/../vendor/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
  fi
  typeset -ga ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)
  typeset -gA ZSH_HIGHLIGHT_STYLES
  ZSH_HIGHLIGHT_STYLES[default]='fg=#d4d4d4'
  ZSH_HIGHLIGHT_STYLES[unknown-token]='fg=#f48771'
  for _qentrah_token in reserved-word precommand; do
    ZSH_HIGHLIGHT_STYLES[$_qentrah_token]='fg=#c586c0'
  done
  for _qentrah_token in command builtin function alias suffix-alias global-alias; do
    ZSH_HIGHLIGHT_STYLES[$_qentrah_token]='fg=#dcdcaa'
  done
  for _qentrah_token in single-quoted-argument double-quoted-argument dollar-quoted-argument; do
    ZSH_HIGHLIGHT_STYLES[$_qentrah_token]='fg=#ce9178'
  done
  ZSH_HIGHLIGHT_STYLES[comment]='fg=#6a9955'
  ZSH_HIGHLIGHT_STYLES[double-quoted-argument-dollar]='fg=#9cdcfe'
  ZSH_HIGHLIGHT_STYLES[single-hyphen-option]='fg=#9cdcfe'
  ZSH_HIGHLIGHT_STYLES[double-hyphen-option]='fg=#9cdcfe'
  ZSH_HIGHLIGHT_STYLES[path]='fg=#d4d4d4'
  ZSH_HIGHLIGHT_STYLES[path_pathseparator]='fg=#a09ca8'
  ZSH_HIGHLIGHT_STYLES[bracket-level-1]='fg=#dcdcaa'
  ZSH_HIGHLIGHT_STYLES[bracket-level-2]='fg=#c586c0'
  ZSH_HIGHLIGHT_STYLES[bracket-level-3]='fg=#9cdcfe'
fi
unset _qentrah_token _qentrah_user_dotdir _qentrah_wrapper QENTRAH_USER_ZDOTDIR
