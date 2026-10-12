ZDOTDIR=$_qentrah_user_dotdir
# macOS /etc/zshrc chooses HISTFILE before this wrapper runs. Keep app resources immutable.
[[ $HISTFILE == "$_qentrah_wrapper/.zsh_history" ]] && HISTFILE="$ZDOTDIR/.zsh_history"
[[ -r $ZDOTDIR/.zshrc ]] && source "$ZDOTDIR/.zshrc"
_qentrah_user_dotdir=${ZDOTDIR:-$HOME}
ZDOTDIR=$_qentrah_wrapper
