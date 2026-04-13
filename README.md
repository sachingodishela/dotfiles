# dotfiles

Personal config files managed with a bare git repo.

## What's included

- `.bashrc` — shell config, fzf integration
- `.tmux.conf` — tmux config (vi mode, mouse, Alt+i prefix)
- `.gitconfig` — git user config
- `.config/nvim/init.lua` — neovim config
- `.config/zed/keymap.json` — zed keybindings
- `.config/zed/settings.json` — zed settings (theme, font size, agent config)

## Setup on a new machine

```bash
git clone --bare git@github.com:sachingodishela/dotfiles.git ~/.dotfiles
alias dotfiles='git --git-dir=$HOME/.dotfiles/ --work-tree=$HOME'
dotfiles config status.showUntrackedFiles no
dotfiles checkout
```

If checkout fails due to existing files, back them up first:

```bash
dotfiles checkout 2>&1 | grep -E "^\s+" | sed 's/^\s*//' | xargs -I{} mv {} {}.bak
dotfiles checkout
```

## Usage

```bash
dotfiles status                   # check what changed
dotfiles add ~/.some-config       # track a new file
dotfiles commit -m "add X"        # commit
dotfiles push                     # push to GitHub
```
