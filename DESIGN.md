# Sistema visual da Central

**Mesa de Comando Operacional & Livro-Razão de Balcão**

A próxima ação operacional vem antes do histórico. O PDV reserva o maior espaço ao catálogo e ao pedido em construção. O KDS ordena os tickets do mais antigo para o mais recente. O caixa começa pelo turno ativo, seguido de sangria, suprimento e fechamento cego; o histórico aparece depois.

O produto utiliza superfícies de papel mineral e tinta verde no claro, superfícies escuras e texto suave no escuro. O acento `action` identifica a ação principal e a seleção. `success`, `warning` e `destructive` indicam estado, sempre acompanhados por ícone e rótulo. Valores pendentes recebem borda tracejada; confirmações usam traço sólido. A forma organiza a leitura sem depender da percepção de cor.

Space Grotesk aparece somente nos títulos e marca. DM Sans serve a interface e leitura. JetBrains Mono com algarismos tabulares serve preços em R$, senhas, NSU, datas e tempos em minutos/segundos. As três fontes são hospedadas no próprio build.

## Componentes e interação

A fonte dos componentes é o registry oficial shadcn/ui `new-york`, sobre primitivas Radix. As adaptações limitam-se aos tokens semânticos, toque mínimo de 48 px, rótulos em português e remoção das transições em seleções. A paleta vive exclusivamente em `apps/central-web/src/styles/tokens.css`.

Sidebar a partir de 1024 px; abaixo disso, navegação inferior com quatro ações e menu de módulos. Painéis do PDV recompõem em coluna em telas estreitas, com uma barra fixa de pagamento quando há itens. Tabelas viram listas até 1279 px para acomodar o conteúdo real em tablets. Inputs usam pelo menos 16 px. F2 abre busca de produtos, F4 abre pagamento e F8 abre movimentações. Dialog, Sheet e AlertDialog devolvem o foco ao elemento que iniciou a operação ao fechar por Esc.

Estados em branco, carregamento com Skeleton, erro inline e tentativa novamente existem nos módulos. Erros de campos usam `aria-invalid` e `role="alert"`. O checkout mantém a mesma chave idempotente após falha de rede e recupera a venda por chave antes de tentar novamente. Sangrias e suprimentos preservam a intenção por operador e turno antes do PIN, bloqueiam sua edição e permitem conferir a mesma chave após reload ou fechamento do turno, evitando duplicação por resposta perdida; PINs e tokens não são persistidos. O fechamento não oferece totais esperados antes de gravar os valores declarados.

Não há animação em seleção de aba, menu ou categoria. Botões têm resposta de pressão em 120 ms. Entradas de modal usam até 280 ms e saídas 180 ms. `prefers-reduced-motion` remove o movimento, preservando os estados finais. O padrão é uma ferramenta de trabalho de uso repetido: navegação e atalhos respondem imediatamente.

## Contraste WCAG AA calculado

O script `pnpm --filter @totem-pdv/central-web contrast` lê os valores reais de `tokens.css`, lineariza sRGB e calcula `(Lmaior + 0,05) / (Lmenor + 0,05)`. Todos os pares textuais abaixo exigem 4,5:1; linhas de controles exigem 3:1. `line` é usado para delimitar campos e marcas gráficas; as separações decorativas leves usam `border`. Tooltips usam exclusivamente `on-night` sobre `night`.

<!-- contrast:start -->

| Tema   | Texto       |      bg | surface |  subtle | selected |
| ------ | ----------- | ------: | ------: | ------: | -------: |
| Claro  | ink         | 13.56:1 | 14.91:1 | 12.62:1 |  12.57:1 |
| Claro  | muted       |  5.87:1 |  6.45:1 |  5.46:1 |   5.44:1 |
| Claro  | action      |  7.20:1 |  7.91:1 |  6.70:1 |   6.67:1 |
| Claro  | success     |  6.76:1 |  7.43:1 |  6.29:1 |   6.26:1 |
| Claro  | warning     |  6.55:1 |  7.20:1 |  6.09:1 |   6.07:1 |
| Claro  | destructive |  6.62:1 |  7.28:1 |  6.16:1 |   6.14:1 |
| Escuro | ink         | 15.65:1 | 13.97:1 | 12.19:1 |  10.20:1 |
| Escuro | muted       | 10.41:1 |  9.30:1 |  8.11:1 |   6.79:1 |
| Escuro | action      | 11.55:1 | 10.32:1 |  9.00:1 |   7.53:1 |
| Escuro | success     | 11.22:1 | 10.02:1 |  8.74:1 |   7.32:1 |
| Escuro | warning     | 12.38:1 | 11.06:1 |  9.64:1 |   8.07:1 |
| Escuro | destructive | 10.12:1 |  9.04:1 |  7.89:1 |   6.60:1 |

| Tema   | Uso                    | Contraste | Mínimo |
| ------ | ---------------------- | --------: | -----: |
| Claro  | on-action sobre action |    7.91:1 |  4.5:1 |
| Claro  | on-night sobre night   |   14.22:1 |  4.5:1 |
| Claro  | line sobre bg          |    3.94:1 |    3:1 |
| Claro  | line sobre surface     |    4.33:1 |    3:1 |
| Claro  | line sobre subtle      |    3.66:1 |    3:1 |
| Claro  | line sobre selected    |    3.65:1 |    3:1 |
| Escuro | on-action sobre action |   10.87:1 |  4.5:1 |
| Escuro | on-night sobre night   |   17.83:1 |  4.5:1 |
| Escuro | line sobre bg          |    5.79:1 |    3:1 |
| Escuro | line sobre surface     |    5.17:1 |    3:1 |
| Escuro | line sobre subtle      |    4.51:1 |    3:1 |
| Escuro | line sobre selected    |    3.77:1 |    3:1 |

<!-- contrast:end -->

## Verificação

Em 21/11/2026, foram executados com sucesso:

- `pnpm --filter @totem-pdv/central-web build`: TypeScript strict e build Vite.
- `pnpm --filter @totem-pdv/central-web test`: 12 testes de cálculo em centavos, opções e recuperação idempotente de checkout e movimentações de caixa.
- `pnpm --filter @totem-pdv/central-web contrast`: todos os 48 pares de texto e 12 pares de controles aprovados.
- `pnpm --filter @totem-pdv/central-web test:e2e`: 8 testes Playwright contra PostgreSQL/Redis/RabbitMQ e a API local, sem mocks HTTP, em 35,1 s na rodada final.

A matriz de navegador visitou os nove módulos em 360, 768, 1280 e 1920 px, nos temas claro e escuro, esperando o conteúdo final antes de verificar ausência de overflow horizontal. Cobriu Tab/Esc/F2/F4/F8, restituição de foco, movimento reduzido e erros inline. As operações integradas incluíram venda em dinheiro com troco, avanço no KDS, cancelamento com PIN e estorno, suprimento, sangria, fechamento cego e conferência sem diferença; cadastro e alteração de produto com tamanhos, adicionais, metadados fiscais, motivo e controle de versão.

Crédito, débito e Pix foram validados com autorização no simulador, persistência do pedido e confirmação somente após `ack` de impressão **SIMULATED**, explicitamente de sandbox. O teste não representa impressão física nem integração com adquirente. O estado do comprovante e o pagamento atualizado foram observados via SSE.

Foram inspecionadas as capturas reais. Exemplos locais: `apps/central-web/test-results/pdv-360-light.png`, `apps/central-web/test-results/pdv-1280-dark.png`, `apps/central-web/test-results/caixa-768-light.png`. A suíte também gera capturas do KDS e configurações. Os arquivos são ignorados pelo Git; podem ser recriados com o comando E2E. O relatório HTML fica em `apps/central-web/test-report/index.html`. Traces estão desativados e a autenticação dos testes ocorre em contexto HTTP separado para não gravar credenciais nos snapshots de tela.

O detector mecânico Impeccable foi executado sobre as mudanças e retornou `[]`. A conferência estática também não encontrou hex solto, classes de paleta padrão, `transition-all`, `transition-colors`, emojis como ícones ou travessões longos nos componentes.

A recuperação de caixa foi revalidada no Docker em `NODE_ENV=production`, em `http://localhost:8080`: dois casos E2E passaram em 10,7 s, incluindo perda proposital da resposta após commit real, reload, turno já fechado e repetição da chave com apenas um lançamento no razão.

## Referências

- [shadcn/ui com Vite](https://ui.shadcn.com/docs/installation/vite)
- [Sistema visual de produto do kit](https://github.com/LucasCamy/agent-project-kit/blob/main/skills/frontend-figma-playwright/references/product-ui-system.md)
- Complementares Taste, UI/UX Pro Max, Impeccable e Design Motion Principles aplicadas ao contexto operacional e subordinadas à missão explícita.

Foi criado o [arquivo Figma da Central](https://www.figma.com/design/jOp90fFsx5Hsy23ATfHIFU). A sessão foi aberta, mas o primeiro acesso ao canvas foi recusado pelo limite MCP do plano Starter. Nenhum frame foi criado. O usuário autorizou explicitamente a alternativa: “Implementar direto no código e validar com Playwright”. A implementação segue essa decisão, sem alegar comparação com frames Figma.
