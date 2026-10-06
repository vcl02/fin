// Espelho local, somente leitura, de um lançamento do Fin legado importado do Supabase.
using System;
using Volo.Abp.Domain.Entities;

namespace Vcl.FinHub.LegacyImports;

public class LegacyFinSnapshot : Entity<long>
{
    public DateOnly? Data { get; private set; }
    public string? Nome { get; private set; }
    public decimal? Valor { get; private set; }
    public string? Categ { get; private set; }
    public string? Freq { get; private set; }
    public bool? Pago { get; private set; }
    public bool? Cred { get; private set; }
    public DateOnly? Fatura { get; private set; }
    public long? RecorrenciaId { get; private set; }
    public string RegistroOriginal { get; private set; } = string.Empty;

    // O construtor vazio e necessario para materializacao pelo Entity Framework.
    protected LegacyFinSnapshot()
    {
    }

    public LegacyFinSnapshot(
        long id,
        DateOnly? data,
        string? nome,
        decimal? valor,
        string? categ,
        string? freq,
        bool? pago,
        bool? cred,
        DateOnly? fatura,
        long? recorrenciaId,
        string registroOriginal)
        : base(id)
    {
        Data = data;
        Nome = nome;
        Valor = valor;
        Categ = categ;
        Freq = freq;
        Pago = pago;
        Cred = cred;
        Fatura = fatura;
        RecorrenciaId = recorrenciaId;
        RegistroOriginal = registroOriginal;
    }
}
