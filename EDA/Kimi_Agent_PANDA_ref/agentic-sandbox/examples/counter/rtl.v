// 正确的 8-bit 计数器（示例设计）
// 端口：clk 时钟，rst_n 低有效异步复位，en 使能，q 计数输出
`default_nettype none

module counter (
    input  wire       clk,
    input  wire       rst_n,
    input  wire       en,
    output reg  [7:0] q
);

    // 时序逻辑：低有效复位清零，使能有效时加 1
    // 显式位宽：8'd1 而不是 1，避免 WIDTH 告警
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n)
            q <= 8'd0;
        else if (en)
            q <= q + 8'd1;
    end

endmodule

`default_nettype wire
