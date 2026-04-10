-- 1. Essentials
vim.g.mapleader = " "
local opt = vim.opt
opt.number = true
opt.relativenumber = true
opt.shiftwidth = 4
opt.tabstop = 4
opt.expandtab = true
opt.termguicolors = true

-- 2. Bootstrap Lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({ "git", "clone", "--filter=blob:none", "https://github.com/folke/lazy.nvim.git", "--branch=stable", lazypath })
end
vim.opt.rtp:prepend(lazypath)

-- 3. Plugins
require("lazy").setup({
  { "catppuccin/nvim", name = "catppuccin", priority = 1000, config = function() 
    vim.cmd.colorscheme "catppuccin-mocha" 
  end },
  -- LeetCode in Neovim
  {
    "kawre/leetcode.nvim",
    lazy = false,
    dependencies = {
      "nvim-telescope/telescope.nvim",
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
    },
    opts = {
      lang = "cpp",
    },
  }, 
  { "nvim-telescope/telescope.nvim", dependencies = { "nvim-lua/plenary.nvim" } },
  { "nvim-treesitter/nvim-treesitter", build = ":TSUpdate" },
  { "hrsh7th/nvim-cmp", dependencies = { "hrsh7th/cmp-nvim-lsp", "L3MON4D3/LuaSnip" } },
  { "nvim-tree/nvim-web-devicons", opts = {} },
})

-- 4. C++ & LSP Setup (Native Neovim 0.11+)
vim.lsp.enable('clangd')

-- 5. Keybindings
local builtin = require('telescope.builtin')
local map = vim.keymap.set
map('n', '<leader>ff', builtin.find_files)
map('n', '<leader>fg', builtin.live_grep)
map('n', 'gd', vim.lsp.buf.definition)
map('n', 'K', vim.lsp.buf.hover)
map('n', '<leader>ca', vim.lsp.buf.code_action) -- Essential for Google L4 refactoring
