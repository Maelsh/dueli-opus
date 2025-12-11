/**
 * Create Competition Page
 * صفحة إنشاء منافسة
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL, getLocalizedName } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function createPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-8">
      <div class="max-w-2xl mx-auto">
        <div class="flex items-center gap-4 mb-6">
          <a href="/?lang=${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
            <i class="fas fa-arrow-${rtl ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
          </a>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${tr.create_competition}</h1>
        </div>
        
        <div id="createFormContainer">
          <!-- Will check auth and show form or login prompt -->
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const isRTL = ${rtl};
      const tr = ${JSON.stringify(tr)};
      let categories = [];
      
      document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        
        if (!window.currentUser) {
          document.getElementById('createFormContainer').innerHTML = \`
            <div class="card p-8 text-center">
              <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-lock text-3xl text-gray-400"></i>
              </div>
              <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">\${tr.login_required}</h2>
              <p class="text-gray-500 mb-4">\${tr.login_subtitle}</p>
              <button onclick="showLoginModal()" class="btn-primary">
                \${tr.login}
              </button>
            </div>
          \`;
          return;
        }
        
        // Load categories
        const catRes = await fetch('/api/categories');
        const catData = await catRes.json();
        if (catData.success) {
          categories = catData.data;
        }
        
        renderCreateForm();
      });
      
      function renderCreateForm() {
        const mainCats = categories.filter(c => !c.parent_id);
        
        document.getElementById('createFormContainer').innerHTML = \`
          <form id="createForm" class="card p-8 space-y-6">
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_title} *</label>
              <input type="text" name="title" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.select_category} *</label>
              <select name="category_id" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3" onchange="updateSubcategories(this.value)">
                <option value="">\${tr.select_category}</option>
                \${mainCats.map(c => \`<option value="\${c.id}">\${getLocalizedName(c, lang)}</option>\`).join('')}
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.select_subcategory}</label>
              <select name="subcategory_id" id="subcategorySelect" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
                <option value="">\${tr.select_subcategory}</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_description}</label>
              <textarea name="description" rows="3" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3"></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_rules} *</label>
              <textarea name="rules" rows="5" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3" placeholder="\${tr.rules_placeholder}"></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.scheduled_time}</label>
              <input type="datetime-local" name="scheduled_at" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
            </div>
            
            <button type="submit" class="btn-primary w-full py-4 text-lg">
              <i class="fas fa-plus mr-2"></i>
              \${tr.create_competition}
            </button>
          </form>
        \`;
        
        document.getElementById('createForm').addEventListener('submit', handleCreate);
      }
      
      function updateSubcategories(parentId) {
        const subCats = categories.filter(c => c.parent_id === parseInt(parentId));
        const select = document.getElementById('subcategorySelect');
        select.innerHTML = '<option value="">' + tr.select_subcategory + '</option>' +
          subCats.map(c => \`<option value="\${c.id}">\${getLocalizedName(c, lang)}</option>\`).join('');
      }
      
      async function handleCreate(e) {
        e.preventDefault();
        const form = e.target;
        
        try {
          const res = await fetch('/api/competitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title.value,
              description: form.description.value,
              rules: form.rules.value,
              category_id: parseInt(form.category_id.value),
              subcategory_id: form.subcategory_id.value ? parseInt(form.subcategory_id.value) : null,
              creator_id: window.currentUser.id,
              language: lang,
              country: window.currentUser.country || 'SA',
              scheduled_at: form.scheduled_at.value || null
            })
          });
          
          const data = await res.json();
          if (data.success) {
            window.location.href = '/competition/' + data.data.id + '?lang=' + lang;
          } else {
            showToast(data.error || 'Error creating competition', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(tr.error_occurred, 'error');
        }
      }
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.create_competition));
}
