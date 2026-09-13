#!/usr/bin/env bash
# رفع iCOOL Steel Studio إلى GitHub — يستخدم بيانات اعتماد git الموجودة على الجهاز
set -e
REPO="${1:-icool-lb/icool-steel-studio1}"

[ -d .git ] || git init -q
git add -A
git commit -qm "iCOOL Steel Studio v2 — parametric steel structure studio" || echo "لا تغييرات جديدة"
git branch -M main
git remote remove origin 2>/dev/null || true
git remote add origin "https://github.com/${REPO}.git"
git push -u origin main

echo ""
echo "✅ تم الرفع: https://github.com/${REPO}"
echo "الخطوة التالية: اربط المشروع بـ Vercel (team: icool-lb's projects)"
