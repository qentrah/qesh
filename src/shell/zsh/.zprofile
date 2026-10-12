ZDOTDIR=$_qentrah_user_dotdir
[[ -r $ZDOTDIR/.zprofile ]] && source "$ZDOTDIR/.zprofile"
_qentrah_user_dotdir=${ZDOTDIR:-$HOME}
ZDOTDIR=$_qentrah_wrapper
