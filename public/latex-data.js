// Datos para autocompletado LaTeX
window.LATEX = {
  commands: [
    // estructura
    'documentclass{}', 'usepackage{}', 'usepackage[]{}', 'begin{}', 'end{}', 'input{}', 'include{}', 'includeonly{}',
    'part{}', 'chapter{}', 'section{}', 'subsection{}', 'subsubsection{}', 'paragraph{}', 'subparagraph{}',
    'section*{}', 'subsection*{}', 'chapter*{}', 'appendix', 'tableofcontents', 'listoffigures', 'listoftables',
    'maketitle', 'title{}', 'author{}', 'date{}', 'today', 'thanks{}', 'and', 'abstract',
    'newpage', 'clearpage', 'cleardoublepage', 'pagebreak', 'linebreak', 'newline', 'noindent', 'indent', 'par',
    'vspace{}', 'hspace{}', 'vfill', 'hfill', 'smallskip', 'medskip', 'bigskip', 'centering', 'raggedright', 'raggedleft',
    'frontmatter', 'mainmatter', 'backmatter', 'pagestyle{}', 'thispagestyle{}', 'pagenumbering{}',
    // texto
    'textbf{}', 'textit{}', 'emph{}', 'underline{}', 'texttt{}', 'textsc{}', 'textsf{}', 'textrm{}', 'textsuperscript{}', 'textsubscript{}',
    'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge',
    'footnote{}', 'url{}', 'href{}{}', 'textcolor{}{}', 'color{}', 'colorbox{}{}', 'item', 'item[]',
    'LaTeX', 'TeX', 'ldots', 'dots', 'quad', 'qquad',
    // referencias y citas
    'label{}', 'ref{}', 'eqref{}', 'pageref{}', 'autoref{}', 'cref{}', 'Cref{}', 'nameref{}', 'vref{}',
    'cite{}', 'citep{}', 'citet{}', 'citeauthor{}', 'citeyear{}', 'parencite{}', 'textcite{}', 'autocite{}', 'footcite{}', 'nocite{*}',
    'bibliography{}', 'bibliographystyle{}', 'addbibresource{}', 'printbibliography', 'printbibliography[title={Referencias}]',
    // figuras/tablas
    'includegraphics{}', 'includegraphics[width=\\linewidth]{}', 'graphicspath{{}}', 'caption{}', 'captionof{}{}',
    'toprule', 'midrule', 'bottomrule', 'hline', 'cline{}', 'multicolumn{}{}{}', 'multirow{}{}{}',
    // matemáticas
    'frac{}{}', 'dfrac{}{}', 'sqrt{}', 'sum', 'sum_{}^{}', 'prod', 'int', 'int_{}^{}', 'iint', 'oint', 'lim_{}', 'infty', 'partial', 'nabla',
    'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi',
    'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
    'cdot', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'propto', 'in', 'notin', 'subset', 'subseteq', 'cup', 'cap',
    'forall', 'exists', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'Leftrightarrow', 'mapsto', 'to',
    'mathbb{}', 'mathcal{}', 'mathbf{}', 'mathrm{}', 'mathit{}', 'boldsymbol{}', 'operatorname{}', 'text{}',
    'left(', 'right)', 'left[', 'right]', 'left\\{', 'right\\}', 'langle', 'rangle', 'hat{}', 'bar{}', 'vec{}', 'dot{}', 'tilde{}', 'overline{}',
    'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'max', 'min', 'det',
    // definiciones
    'newcommand{}{}', 'renewcommand{}{}', 'newenvironment{}{}{}', 'newtheorem{}{}', 'DeclareMathOperator{}{}', 'setlength{}{}',
    'makeindex', 'index{}', 'printindex', 'makeglossaries', 'printglossaries', 'gls{}', 'newacronym{}{}{}',
    // beamer
    'frametitle{}', 'titlepage', 'usetheme{}', 'usecolortheme{}', 'pause', 'only<>{}', 'onslide<>{}',
  ],
  environments: [
    'document', 'abstract', 'itemize', 'enumerate', 'description', 'figure', 'figure*', 'table', 'table*', 'tabular', 'tabularx', 'longtable',
    'center', 'flushleft', 'flushright', 'quote', 'quotation', 'verbatim', 'minipage', 'equation', 'equation*', 'align', 'align*',
    'gather', 'gather*', 'multline', 'split', 'cases', 'matrix', 'pmatrix', 'bmatrix', 'vmatrix', 'array',
    'theorem', 'lemma', 'proof', 'definition', 'corollary', 'proposition', 'remark', 'example',
    'thebibliography', 'appendices', 'frame', 'block', 'columns', 'column', 'lstlisting', 'minted', 'tikzpicture', 'subfigure',
  ],
  packages: [
    'amsmath', 'amssymb', 'amsthm', 'mathtools', 'graphicx', 'xcolor', 'hyperref', 'cleveref', 'geometry', 'babel', 'inputenc', 'fontenc',
    'booktabs', 'tabularx', 'longtable', 'multirow', 'array', 'caption', 'subcaption', 'float', 'wrapfig', 'enumitem',
    'natbib', 'biblatex', 'csquotes', 'url', 'listings', 'minted', 'tikz', 'pgfplots', 'siunitx', 'fancyhdr', 'setspace',
    'titlesec', 'tocloft', 'appendix', 'makeidx', 'glossaries', 'lipsum', 'blindtext', 'microtype', 'lmodern', 'times', 'mathptmx',
    'fontspec', 'unicode-math', 'polyglossia', 'parskip', 'xparse', 'etoolbox', 'todonotes', 'pdfpages', 'algorithm', 'algpseudocode',
    'chemfig', 'mhchem', 'physics', 'bm', 'upgreek', 'textcomp', 'verbatim', 'comment', 'ragged2e', 'multicol', 'framed', 'tcolorbox',
    'varioref', 'nameref', 'footmisc', 'acronym', 'nomencl', 'apacite', 'cite', 'dirtree', 'qrcode', 'eurosym',
  ],
  bibStyles: ['plain', 'plainnat', 'unsrt', 'unsrtnat', 'alpha', 'abbrv', 'abbrvnat', 'ieeetr', 'apalike', 'acm', 'siam', 'apacite'],
  snippets: {
    section: '\\section{|}\\label{sec:}\n',
    itemize: '\\begin{itemize}\n  \\item |\n\\end{itemize}\n',
    enumerate: '\\begin{enumerate}\n  \\item |\n\\end{enumerate}\n',
    equation: '\\begin{equation}\\label{eq:}\n  |\n\\end{equation}\n',
    figure: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.7\\linewidth]{|}\n  \\caption{}\\label{fig:}\n\\end{figure}\n',
    table: '\\begin{table}[htbp]\n  \\centering\n  \\caption{|}\\label{tab:}\n  \\begin{tabular}{lcc}\n    \\toprule\n    A & B & C \\\\\n    \\midrule\n    1 & 2 & 3 \\\\\n    \\bottomrule\n  \\end{tabular}\n\\end{table}\n',
    footnote: '\\footnote{|}',
  },
  bibTypes: {
    article: ['author', 'title', 'journal', 'year', 'volume', 'number', 'pages', 'doi'],
    book: ['author', 'title', 'publisher', 'year', 'address', 'edition', 'isbn'],
    inproceedings: ['author', 'title', 'booktitle', 'year', 'pages', 'publisher', 'doi'],
    incollection: ['author', 'title', 'booktitle', 'editor', 'publisher', 'year', 'pages'],
    phdthesis: ['author', 'title', 'school', 'year'],
    mastersthesis: ['author', 'title', 'school', 'year'],
    techreport: ['author', 'title', 'institution', 'year', 'number'],
    misc: ['author', 'title', 'howpublished', 'year', 'note', 'url'],
    online: ['author', 'title', 'url', 'urldate', 'year'],
  },
};
