# dotfiles

Personal config files managed with a bare git repo.

## What's included

- `.bashrc` — shell config, fzf integration
- `.tmux.conf` — tmux config (vi mode, mouse, Alt+i prefix)
- `.gitconfig` — git user config
- `.config/nvim/init.lua` — neovim config
- `.config/zed/keymap.json` — zed keybindings
- `.config/zed/settings.json` — zed settings (theme, font size, agent config)
- `gnome-terminal.dconf` — GNOME Terminal profile (colors, font, bell)

## Setup on a new machine

Install the tools these configs depend on:

```bash
sudo apt update && sudo apt install -y \
  tmux \
  neovim \
  fzf \
  fd-find \
  bat \
  ripgrep \
  clangd

# Rust toolchain (cargo is referenced in .bashrc)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Zed editor
curl -fsSL https://zed.dev/install.sh | sh
```

Then clone and activate the dotfiles:

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

## GNOME Terminal profile

Restore on a new machine (after checkout):

```bash
dconf load /org/gnome/terminal/ < ~/gnome-terminal.dconf
```

Update the dotfile after changing terminal settings:

```bash
dconf dump /org/gnome/terminal/ > ~/gnome-terminal.dconf
dotfiles add ~/gnome-terminal.dconf
dotfiles commit -m "update terminal profile"
dotfiles push
```

## Usage

```bash
dotfiles status                   # check what changed
dotfiles add ~/.some-config       # track a new file
dotfiles commit -m "add X"        # commit
dotfiles push                     # push to GitHub
```
