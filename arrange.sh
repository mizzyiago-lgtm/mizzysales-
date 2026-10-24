#!/usr/bin/env bash
# Run from the ROOT of your repo (where server.js is):  bash arrange.sh
set -e
[ -f server.js ] || { echo "Run this from the folder that contains server.js"; exit 1; }

mkdir -p lib public/js public/css public/img public/uploads public/receipts public/files

mv_() { # mv_ "source" "dest"  (skips if source missing)
  [ -e "$1" ] && mv -f "$1" "$2" || echo "  (skip, not found: $1)"
  }

  echo "1) Dotfiles"
  mv_ "1.gitignore" ".gitignore"
  for d in uploads receipts files; do : > public/$d/.gitkeep; done
  rm -f "2.gitkeep" "gitkeep (1)" "gitkeep (2)"

  echo "2) Server modules -> lib/"
  mv_ "boost (1).js"   lib/boost.js
  mv_ "market2 (1).js" lib/market2.js
  mv_ "market3 (1).js" lib/market3.js
  mv_ "market4 (1).js" lib/market4.js
  for f in boost2 brand-logos campaigns countries engagement flw-methods fx geo \
           global-payments mailer minipdf mizzy-upgrade mysql opaque-ref otp-suite \
                    platform restock-notify settings tutorials welcomepopup; do
                      mv_ "$f.js" "lib/$f.js"
                      done
                      mv_ countries.data.json lib/countries.data.json

                      echo "3) Browser JS that lives in public/ root"
                      for f in script market2 market3 market4 marketplace tools game welcome-popup; do
                        mv_ "$f.js" "public/$f.js"
                        done
                        mv_ style.css public/style.css
                        mv_ theme.css public/theme.css

                        echo "4) Remaining browser JS -> public/js"
                        for f in *.js; do
                          case "$f" in server.js|site.config.js) ;; *) mv_ "$f" "public/js/$f";; esac
                          done

                          echo "5) CSS -> public/css"
                          for f in *.css; do mv_ "$f" "public/css/$f"; done

                          echo "6) Images -> public/img (icons used by manifest)"
                          for f in mizzy-*.png mizzy-*.svg; do mv_ "$f" "public/img/$f"; done

                          echo "7) HTML + root static files -> public/"
                          for f in *.html; do mv_ "$f" "public/$f"; done
                          for f in favicon.png favicon-32.png apple-touch-icon.png manifest.json robots.txt; do
                            mv_ "$f" "public/$f"
                            done

                            echo "8) Install dependencies"
                            npm install

                            echo "9) Syntax check"
                            for f in server.js lib/*.js; do node --check "$f" || echo "  !! error in $f"; done

                            [ -f .env ] || cat > .env <<'ENV'
                            NODE_ENV=development
                            PORT=8080
                            MONGODB_URI=mongodb+srv://USER:PASS@CLUSTER.mongodb.net/mizzysales
                            JWT_SECRET=change-this-to-a-random-string-of-at-least-32-characters
                            ADMIN_PASSCODE=change-this-passcode-12+
                            ADMIN_SECRET_PATH=change-this-long-random-private-path
                            ENV

                            echo
                            echo "Done. Edit .env (set MONGODB_URI), then run:  npm start"