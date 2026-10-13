ZDOTDIR=$_qentrah_user_dotdir
# macOS /etc/zshrc chooses HISTFILE before this wrapper runs. Keep app resources immutable.
[[ $HISTFILE == "$_qentrah_wrapper/.zsh_history" ]] && HISTFILE="$ZDOTDIR/.zsh_history"
[[ -r $ZDOTDIR/.zshrc ]] && source "$ZDOTDIR/.zshrc"
_qentrah_user_dotdir=${ZDOTDIR:-$HOME}
ZDOTDIR=$_qentrah_wrapper

# QH command discovery. Keep completion caches outside the signed bundle.
if (( ! $+functions[compdef] )); then
  autoload -Uz compinit
  compinit -i -D
fi
_qh_complete() {
  local -a commands
  commands=("${(@f)$(qh completions 2>/dev/null)}")
  _describe 'qh command' commands
}
compdef _qh_complete qh qh
