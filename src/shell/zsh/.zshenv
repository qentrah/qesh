# Load the user's startup files without changing files in their home directory.
typeset -g _qentrah_wrapper=$ZDOTDIR
typeset -g _qentrah_user_dotdir=${QENTRAH_USER_ZDOTDIR:-$HOME}
ZDOTDIR=$_qentrah_user_dotdir
[[ -r $ZDOTDIR/.zshenv ]] && source "$ZDOTDIR/.zshenv"
_qentrah_user_dotdir=${ZDOTDIR:-$HOME}
ZDOTDIR=$_qentrah_wrapper
