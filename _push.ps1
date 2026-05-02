git config --global user.email "ituy66@outlook.fr"
git config --global user.name "ituy66-alt"
git add .
git commit -m "Flux Store"
git branch -M main
git remote remove origin
git remote add origin https://github.com/ituy66-alt/siteweb.git
git push origin main --force
